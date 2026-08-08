// @montara/quality — post-render self-review (Quality governance §I).
// Reads the finished MP4 back: ffprobe streams/duration, 4-position frame decode checks, audio
// silence/clip detection, delivery-promise reconciliation, subtitle presence. Emits a report.
// Silence/clip/missing-audio are WARN (Stage-1 fallbacks ship silent); only structural breakage
// (missing file, zero duration, no video, undecodable frames, broken duration promise) is a FAIL.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Timeline } from "../../core/src/index";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { DecisionTrail } from "./audit";
import { scoreAudioRisk, type AudioRiskReport } from "./audioRisk";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ReviewCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface SelfReviewProbe {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
}

export interface SelfReviewReport {
  mp4Path: string;
  /** true when no check FAILed (warnings allowed) */
  ok: boolean;
  checks: ReviewCheck[];
  probe: SelfReviewProbe;
  /**
   * Scored audio dimensions on the same 0..5 scale the picture is scored on.
   *
   * The pass/warn checks below remain for continuity; this is what makes audio a *scored*
   * dimension rather than a presence test. Omitted when `scoreAudio` is false.
   */
  audio?: AudioRiskReport;
}

export interface SelfReviewOptions {
  timeline?: Timeline;
  targetDurationSec?: number;
  durationTolSec?: number;
  subtitlePath?: string;
  trail?: DecisionTrail;
  /** Score audio risk. Costs one loudnorm analysis pass on files that have audio. Default true. */
  scoreAudio?: boolean;
  /** Delivery loudness target the audio score is judged against. Default -14 LUFS. */
  targetLufs?: number;
}

interface ProbeBase {
  duration: number;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

function ffprobeStreams(mp4: string): ProbeBase {
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json",
    mp4,
  ], { encoding: "utf8" });
  const base: ProbeBase = { duration: 0, width: 0, height: 0, hasVideo: false, hasAudio: false };
  try {
    const data = JSON.parse(r.stdout || "{}") as {
      streams?: { codec_type?: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    for (const s of data.streams ?? []) {
      if (s.codec_type === "video") { base.hasVideo = true; base.width = s.width ?? base.width; base.height = s.height ?? base.height; }
      if (s.codec_type === "audio") base.hasAudio = true;
    }
    base.duration = parseFloat(data.format?.duration ?? "0") || 0;
  } catch { /* leave defaults */ }
  return base;
}

function volumeStats(mp4: string): { mean: number | null; max: number | null } {
  const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", mp4, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" });
  const text = r.stderr || "";
  const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(text);
  const max = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/.exec(text);
  return {
    mean: mean ? Number(mean[1]) : null,
    max: max ? Number(max[1]) : null,
  };
}

/** Decode a frame at 10/35/65/90% of the runtime; count how many produced a real PNG. */
function sampleFrames(mp4: string, duration: number): { extracted: number; positions: number } {
  const ratios = [0.1, 0.35, 0.65, 0.9];
  const work = join(tmpdir(), `montara-review-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  let extracted = 0;
  ratios.forEach((ratio, i) => {
    const at = Math.max(0, duration * ratio);
    const out = join(work, `frame-${i}.png`);
    spawnSync(mediaBin("ffmpeg"), ["-y", "-ss", at.toFixed(3), "-i", mp4, "-frames:v", "1", out], { encoding: "utf8" });
    try { if (existsSync(out) && statSync(out).size > 120) extracted++; } catch { /* a miss is counted as not-extracted */ }
  });
  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  return { extracted, positions: ratios.length };
}

export function postRenderSelfReview(mp4Path: string, opts: SelfReviewOptions = {}): SelfReviewReport {
  const checks: ReviewCheck[] = [];
  const present = existsSync(mp4Path);
  const base = present ? ffprobeStreams(mp4Path) : { duration: 0, width: 0, height: 0, hasVideo: false, hasAudio: false };
  const vol = present && base.hasAudio ? volumeStats(mp4Path) : { mean: null, max: null };

  const probe: SelfReviewProbe = {
    durationSec: base.duration,
    hasVideo: base.hasVideo,
    hasAudio: base.hasAudio,
    width: base.width,
    height: base.height,
    meanVolumeDb: vol.mean,
    maxVolumeDb: vol.max,
  };

  checks.push({ name: "file present", status: present ? "pass" : "fail", detail: present ? mp4Path : "missing on disk" });
  checks.push({ name: "non-zero duration", status: probe.durationSec > 0.1 ? "pass" : "fail", detail: `${probe.durationSec.toFixed(2)}s` });
  checks.push({ name: "video stream present", status: probe.hasVideo ? "pass" : "fail", detail: probe.hasVideo ? `${probe.width}x${probe.height}` : "none" });

  if (present && probe.hasVideo && probe.durationSec > 0.1) {
    const frames = sampleFrames(mp4Path, probe.durationSec);
    checks.push({
      name: "4-position frame checks",
      status: frames.extracted === frames.positions ? "pass" : frames.extracted > 0 ? "warn" : "fail",
      detail: `${frames.extracted}/${frames.positions} frames decodable`,
    });
  }

  if (!probe.hasAudio) {
    checks.push({ name: "audio present", status: "warn", detail: "no audio track" });
  } else {
    const silent = probe.meanVolumeDb != null && probe.meanVolumeDb < -60;
    const clipping = probe.maxVolumeDb != null && probe.maxVolumeDb >= -0.1;
    checks.push({ name: "audio not silent", status: silent ? "warn" : "pass", detail: `mean ${probe.meanVolumeDb ?? "?"} dB` });
    checks.push({ name: "audio not clipping", status: clipping ? "warn" : "pass", detail: `max ${probe.maxVolumeDb ?? "?"} dB` });
  }

  if (opts.targetDurationSec != null) {
    const tol = opts.durationTolSec ?? 0.6;
    const diff = Math.abs(probe.durationSec - opts.targetDurationSec);
    checks.push({
      name: "delivery promise (duration)",
      status: diff <= tol ? "pass" : "fail",
      detail: `${probe.durationSec.toFixed(2)}s vs ${opts.targetDurationSec.toFixed(2)}s (±${tol}s)`,
    });
  }

  if (opts.subtitlePath) {
    let okSub = false;
    try { okSub = existsSync(opts.subtitlePath) && statSync(opts.subtitlePath).size > 8; } catch { okSub = false; }
    checks.push({ name: "subtitle present", status: okSub ? "pass" : "warn", detail: opts.subtitlePath });
  }

  // Audio scored the way picture is scored. Kept non-fatal for the same reason the presence check
  // is: Stage-1 fallbacks legitimately ship silent, so a weak mix warns rather than blocks.
  let audio: AudioRiskReport | undefined;
  if (present && opts.scoreAudio !== false) {
    audio = scoreAudioRisk(mp4Path, { targetLufs: opts.targetLufs });
    const worst = Object.entries(audio.dimensions)
      .filter(([, d]) => d.score >= 3)
      .map(([name, d]) => `${name} ${d.score}`)
      .join(", ");
    checks.push({
      name: "audio risk score",
      status: audio.verdict === "strong" || audio.verdict === "acceptable" ? "pass" : "warn",
      detail: `${audio.average}/5 ${audio.verdict}${worst ? ` — ${worst}` : ""}`,
    });
  }

  const ok = checks.every((c) => c.status !== "fail");
  opts.trail?.record({
    kind: "post-render-self-review",
    chosen: ok ? "ACCEPT" : "REJECT",
    confidence: ok ? 0.9 : 0.95,
    rationale: checks.filter((c) => c.status !== "pass").map((c) => `${c.name}:${c.status}`).join("; ") || "all checks passed",
    alternatives: checks.filter((c) => c.status === "fail").map((c) => ({ label: c.name })),
  });
  return { mp4Path, ok, checks, probe, ...(audio ? { audio } : {}) };
}

export function writeSelfReview(report: SelfReviewReport, path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}
