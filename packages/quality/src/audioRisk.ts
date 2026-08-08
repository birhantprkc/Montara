// @montara/quality — audio-risk scorer over a rendered file.
//
// Video quality was scored across six dimensions while audio was only ever a *presence* check:
// "is there a track, is it silent, is it clipping." That let a technically-present but unusable
// mix pass a gate that would have rejected the same weakness in the picture. This scores audio the
// same way `slideshowRisk` scores picture — 0..5 per dimension, higher is worse:
//
//   absent:             no audio track at all
//   silence:            a track exists but carries effectively nothing
//   loudness_offtarget: integrated loudness is far from the delivery target
//   clipping:           true peak is at or over the ceiling
//   dynamics:           over-compressed (pumping) or unmastered-wide loudness range
//   coverage:           audio stops before the picture does
//
// Measurement is real: ffprobe for streams and durations, `volumedetect` for mean/peak, and a
// `loudnorm` analysis pass for integrated LUFS and LRA. Nothing here is estimated from the plan.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { measureLoudness, mediaBin } from "../../render-ffmpeg/src/index";

export type AudioVerdict = "strong" | "acceptable" | "revise" | "fail";

export interface AudioDimension {
  score: number;
  reason: string;
}

export interface AudioMeasurement {
  hasAudio: boolean;
  videoDurationSec: number;
  audioDurationSec: number;
  meanVolumeDb: number | null;
  peakVolumeDb: number | null;
  /** Integrated loudness (LUFS) from a loudnorm analysis pass. */
  lufs: number | null;
  /** Loudness range — low means over-compressed, high means unmastered. */
  lra: number | null;
}

export interface AudioRiskReport {
  average: number;
  verdict: AudioVerdict;
  dimensions: Record<string, AudioDimension>;
  measured: AudioMeasurement;
  /** Delivery target the loudness dimension was scored against. */
  targetLufs: number;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Same thresholds as the slideshow scorer, so the two verdicts mean the same thing. */
function verdictFor(average: number): AudioVerdict {
  if (average < 2.0) return "strong";
  if (average < 3.0) return "acceptable";
  if (average < 4.0) return "revise";
  return "fail";
}

const RANK: Record<AudioVerdict, number> = { strong: 0, acceptable: 1, revise: 2, fail: 3 };

/**
 * Dimensions that make a delivery unusable rather than merely imperfect.
 *
 * `dynamics` and `loudness_offtarget` are deliberately excluded: both are correctable by re-running
 * a mastering pass, so they should pull the average without condemning the render. Clipping,
 * silence, a missing track, and audio that stops before the picture cannot be fixed downstream.
 */
const CRITICAL = new Set(["absent", "silence", "clipping", "coverage"]);

/**
 * Verdict from the mean, floored by the worst *critical* dimension.
 *
 * Averaging six dimensions hides a catastrophic one: a clipped master scores 5.0 on `clipping` and
 * still averages into "acceptable" once five healthy dimensions dilute it. Audio defects of that
 * kind do not average away, so a critical dimension at 4.0+ drags the verdict to at least "revise".
 */
function combinedVerdict(average: number, dimensions: Record<string, AudioDimension>): AudioVerdict {
  const byAverage = verdictFor(average);
  const worstCritical = Math.max(
    0,
    ...Object.entries(dimensions).filter(([name]) => CRITICAL.has(name)).map(([, d]) => d.score),
  );
  const floor: AudioVerdict = worstCritical >= 4.0 ? "revise" : "strong";
  return RANK[floor] > RANK[byAverage] ? floor : byAverage;
}

interface StreamProbe {
  hasAudio: boolean;
  videoDurationSec: number;
  audioDurationSec: number;
}

function probeStreams(path: string): StreamProbe {
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "error",
    "-show_entries", "stream=codec_type,duration:format=duration",
    "-of", "json", path,
  ], { encoding: "utf8", maxBuffer: 1 << 24 });
  const out: StreamProbe = { hasAudio: false, videoDurationSec: 0, audioDurationSec: 0 };
  try {
    const j = JSON.parse(r.stdout || "{}") as {
      streams?: { codec_type?: string; duration?: string }[];
      format?: { duration?: string };
    };
    const container = parseFloat(j.format?.duration ?? "0") || 0;
    out.videoDurationSec = container;
    for (const s of j.streams ?? []) {
      const dur = parseFloat(s.duration ?? "0") || 0;
      if (s.codec_type === "audio") {
        out.hasAudio = true;
        // Some containers omit per-stream duration; fall back to the container length.
        out.audioDurationSec = Math.max(out.audioDurationSec, dur || container);
      }
      if (s.codec_type === "video" && dur) out.videoDurationSec = dur;
    }
  } catch {
    // A failed probe scores as "absent" rather than throwing — a gate must never crash a run.
  }
  return out;
}

function volumeStats(path: string): { mean: number | null; peak: number | null } {
  const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"], {
    encoding: "utf8", maxBuffer: 1 << 24,
  });
  const err = r.stderr || "";
  const mean = err.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  const peak = err.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  return { mean: mean ? parseFloat(mean[1]!) : null, peak: peak ? parseFloat(peak[1]!) : null };
}

function scoreSilence(m: AudioMeasurement): AudioDimension {
  if (m.meanVolumeDb == null) return { score: 2.5, reason: "Mean level could not be measured" };
  if (m.meanVolumeDb < -60) return { score: 5.0, reason: `Effectively silent (mean ${m.meanVolumeDb} dB)` };
  if (m.meanVolumeDb < -45) return { score: 3.0, reason: `Very quiet (mean ${m.meanVolumeDb} dB)` };
  if (m.meanVolumeDb < -35) return { score: 1.5, reason: `Quiet but audible (mean ${m.meanVolumeDb} dB)` };
  return { score: 0.0, reason: `Healthy level (mean ${m.meanVolumeDb} dB)` };
}

function scoreLoudness(m: AudioMeasurement, target: number): AudioDimension {
  if (m.lufs == null || !Number.isFinite(m.lufs)) {
    return { score: 2.0, reason: "Integrated loudness could not be measured" };
  }
  const delta = Math.abs(m.lufs - target);
  // Platforms re-normalise, so being far off target is a real delivery defect, not a taste call.
  if (delta <= 1.0) return { score: 0.0, reason: `${round1(m.lufs)} LUFS, on target (${target})` };
  if (delta <= 2.5) return { score: 1.5, reason: `${round1(m.lufs)} LUFS, ${round1(delta)} off target (${target})` };
  if (delta <= 5.0) return { score: 3.0, reason: `${round1(m.lufs)} LUFS, ${round1(delta)} off target (${target})` };
  return { score: 5.0, reason: `${round1(m.lufs)} LUFS, ${round1(delta)} off target (${target}) — will be re-normalised` };
}

function scoreClipping(m: AudioMeasurement): AudioDimension {
  if (m.peakVolumeDb == null) return { score: 1.0, reason: "Peak level could not be measured" };
  if (m.peakVolumeDb >= 0) return { score: 5.0, reason: `Clipping (peak ${m.peakVolumeDb} dB)` };
  if (m.peakVolumeDb >= -0.3) return { score: 3.5, reason: `At the ceiling (peak ${m.peakVolumeDb} dB)` };
  if (m.peakVolumeDb >= -1.0) return { score: 1.5, reason: `Very close to the ceiling (peak ${m.peakVolumeDb} dB)` };
  return { score: 0.0, reason: `Peak ${m.peakVolumeDb} dB, safe headroom` };
}

function scoreDynamics(m: AudioMeasurement): AudioDimension {
  if (m.lra == null || !Number.isFinite(m.lra)) {
    return { score: 1.0, reason: "Loudness range could not be measured" };
  }
  if (m.lra < 1.0) return { score: 4.0, reason: `Loudness range ${round1(m.lra)} LU — flat, likely over-compressed` };
  if (m.lra < 3.0) return { score: 2.0, reason: `Loudness range ${round1(m.lra)} LU — compressed` };
  if (m.lra > 20.0) return { score: 3.0, reason: `Loudness range ${round1(m.lra)} LU — unmastered spread` };
  return { score: 0.0, reason: `Loudness range ${round1(m.lra)} LU` };
}

function scoreCoverage(m: AudioMeasurement): AudioDimension {
  if (m.videoDurationSec <= 0 || m.audioDurationSec <= 0) {
    return { score: 2.0, reason: "Durations could not be compared" };
  }
  const ratio = Math.min(1, m.audioDurationSec / m.videoDurationSec);
  const gap = m.videoDurationSec - m.audioDurationSec;
  if (ratio >= 0.99) return { score: 0.0, reason: "Audio runs the full length of the picture" };
  if (ratio >= 0.95) return { score: 1.5, reason: `Audio ends ${round1(gap)}s early` };
  if (ratio >= 0.8) return { score: 3.0, reason: `Audio ends ${round1(gap)}s early (${Math.round(ratio * 100)}% coverage)` };
  return { score: 5.0, reason: `Audio covers only ${Math.round(ratio * 100)}% of the picture` };
}

/**
 * Score a rendered file's audio the way picture is scored.
 *
 * Returns a `fail` verdict with an `absent` dimension when there is no audio at all — the case the
 * old presence check already caught, now expressed on the same scale as every other dimension.
 */
export function scoreAudioRisk(mp4Path: string, opts: { targetLufs?: number } = {}): AudioRiskReport {
  const target = opts.targetLufs ?? -14;
  const empty: AudioMeasurement = {
    hasAudio: false, videoDurationSec: 0, audioDurationSec: 0,
    meanVolumeDb: null, peakVolumeDb: null, lufs: null, lra: null,
  };

  if (!existsSync(mp4Path)) {
    return {
      average: 5.0,
      verdict: "fail",
      dimensions: { absent: { score: 5.0, reason: "File missing on disk" } },
      measured: empty,
      targetLufs: target,
    };
  }

  const streams = probeStreams(mp4Path);
  if (!streams.hasAudio) {
    return {
      average: 5.0,
      verdict: "fail",
      dimensions: { absent: { score: 5.0, reason: "No audio track" } },
      measured: { ...empty, videoDurationSec: streams.videoDurationSec },
      targetLufs: target,
    };
  }

  const vol = volumeStats(mp4Path);
  const loud = measureLoudness(mp4Path, { lufs: target });
  const measured: AudioMeasurement = {
    hasAudio: true,
    videoDurationSec: streams.videoDurationSec,
    audioDurationSec: streams.audioDurationSec,
    meanVolumeDb: vol.mean,
    peakVolumeDb: vol.peak,
    lufs: loud && Number.isFinite(loud.inputI) ? loud.inputI : null,
    lra: loud && Number.isFinite(loud.inputLra) ? loud.inputLra : null,
  };

  const dimensions: Record<string, AudioDimension> = {
    absent: { score: 0.0, reason: "Audio track present" },
    silence: scoreSilence(measured),
    loudness_offtarget: scoreLoudness(measured, target),
    clipping: scoreClipping(measured),
    dynamics: scoreDynamics(measured),
    coverage: scoreCoverage(measured),
  };

  const scores = Object.values(dimensions).map((d) => d.score);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  return { average: round2(average), verdict: combinedVerdict(average, dimensions), dimensions, measured, targetLufs: target };
}
