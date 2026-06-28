// @montara/render-ffmpeg — audio mastering (the craft layer's loudness pass).
// One measured two-pass EBU R128 loudnorm to a broadcast/social target (default -14 LUFS,
// -1 dBTP, 48 kHz). Measure-then-correct avoids the pumping that a single naive pass causes.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { mediaBin } from "./ffmpegPath";

export interface LoudnessStats {
  inputI: number;   // integrated loudness, LUFS
  inputTp: number;  // true peak, dBTP
  inputLra: number; // loudness range
  inputThresh: number;
  targetOffset: number;
}

export interface MasterOptions {
  /** Integrated loudness target in LUFS. -14 = YouTube/Spotify, -16 = podcast, -23 = broadcast. */
  lufs?: number;
  /** True-peak ceiling in dBTP. */
  truePeak?: number;
  /** Loudness range. */
  lra?: number;
  /** Output sample rate. */
  sampleRate?: number;
}

function runCapture(bin: string, args: string[]): { status: number; stderr: string } {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  return { status: r.status ?? -1, stderr: r.stderr || r.error?.message || "" };
}

/** The last JSON object printed in an ffmpeg stderr stream (loudnorm print_format=json). */
function lastJsonBlock(text: string): Record<string, string> | null {
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, string>; } catch { return null; }
}

/** Measure integrated loudness / true peak with a single loudnorm analysis pass. */
export function measureLoudness(input: string, opts: MasterOptions = {}): LoudnessStats | null {
  const I = opts.lufs ?? -14, TP = opts.truePeak ?? -1, LRA = opts.lra ?? 11;
  const { stderr } = runCapture(mediaBin("ffmpeg"), [
    "-hide_banner", "-i", input,
    "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`,
    "-f", "null", "-",
  ]);
  const j = lastJsonBlock(stderr);
  if (!j) return null;
  return {
    inputI: parseFloat(j.input_i ?? "NaN"),
    inputTp: parseFloat(j.input_tp ?? "NaN"),
    inputLra: parseFloat(j.input_lra ?? "NaN"),
    inputThresh: parseFloat(j.input_thresh ?? "NaN"),
    targetOffset: parseFloat(j.target_offset ?? "0"),
  };
}

export interface MasterResult {
  ok: boolean;
  outPath: string;
  measuredBefore: LoudnessStats | null;
  measuredAfter: number | null; // integrated LUFS after, if re-measured
  error?: string;
}

/** Two-pass loudness master: measure, then correct to target. Output is mastered audio. */
export function masterAudio(input: string, outPath: string, opts: MasterOptions = {}): MasterResult {
  const I = opts.lufs ?? -14, TP = opts.truePeak ?? -1, LRA = opts.lra ?? 11, sr = opts.sampleRate ?? 48000;
  mkdirSync(dirname(outPath), { recursive: true });
  const ff = mediaBin("ffmpeg");
  const stats = measureLoudness(input, opts);
  if (!stats || Number.isNaN(stats.inputI)) {
    // fall back to a single dynamic pass (still produces a real, loudness-corrected file)
    const r = runCapture(ff, ["-y", "-i", input, "-af", `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`, "-ar", String(sr), outPath]);
    return { ok: r.status === 0, outPath, measuredBefore: stats, measuredAfter: null, error: r.status === 0 ? undefined : r.stderr.slice(-400) };
  }
  const af = [
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`,
    `measured_I=${stats.inputI}`,
    `measured_TP=${stats.inputTp}`,
    `measured_LRA=${stats.inputLra}`,
    `measured_thresh=${stats.inputThresh}`,
    `offset=${stats.targetOffset}`,
    "linear=true",
    "print_format=summary",
  ].join(":");
  const r = runCapture(ff, ["-y", "-i", input, "-af", af, "-ar", String(sr), outPath]);
  if (r.status !== 0) return { ok: false, outPath, measuredBefore: stats, measuredAfter: null, error: r.stderr.slice(-400) };
  const after = measureLoudness(outPath, opts);
  return { ok: true, outPath, measuredBefore: stats, measuredAfter: after?.inputI ?? null };
}
