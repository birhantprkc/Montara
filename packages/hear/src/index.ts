// @montara/hear — the audio-understanding boundary. Speaker differentiation (voice-ID) via
// the Resemblyzer embedding tool. Shells out to `voice_id.py` (heavy: torch) and parses JSON,
// so nothing here pulls torch into the gate. Availability is checked with importlib.find_spec
// (no torch import), keeping discovery fast.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";

const VOICE_ID_SCRIPT = "voice_id.py";

function findPython(): string | null {
  for (const cand of ["python", "python3", "py"]) {
    const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cand;
  }
  return null;
}

function hearRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, VOICE_ID_SCRIPT))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** Whether voice-ID can run: Python + the script + Resemblyzer installed (no torch import). */
export function voiceIdAvailable(root: string = hearRoot()): boolean {
  const py = findPython();
  if (!py || !existsSync(join(root, VOICE_ID_SCRIPT))) return false;
  const chk = spawnSync(py, ["-c", "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('resemblyzer') else 1)"], { encoding: "utf8" });
  return chk.status === 0;
}

export interface VoiceCompareResult {
  ok: boolean;
  match: string;
  scores: Record<string, number>;
  margin: number;
}

/** Classify a test clip against labelled reference clips. Returns the closest speaker. */
export function voiceCompare(testWav: string, refs: [label: string, wav: string][], root: string = hearRoot()): VoiceCompareResult | null {
  const py = findPython();
  if (!py) return null;
  const args = [join(root, VOICE_ID_SCRIPT), "compare", testWav];
  for (const [label, wav] of refs) args.push(label, wav);
  const res = spawnSync(py, args, { cwd: root, encoding: "utf8" });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout ?? "null") as VoiceCompareResult;
  } catch {
    return null;
  }
}

export interface VoiceVerifyResult {
  ok: boolean;
  similarity: number;
  same_speaker: boolean;
  threshold: number;
}

/** Verify whether two clips are the same speaker (cosine similarity vs threshold). */
export function voiceVerify(a: string, b: string, threshold = 0.75, root: string = hearRoot()): VoiceVerifyResult | null {
  const py = findPython();
  if (!py) return null;
  const res = spawnSync(py, [join(root, VOICE_ID_SCRIPT), "verify", a, b, String(threshold)], { cwd: root, encoding: "utf8" });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout ?? "null") as VoiceVerifyResult;
  } catch {
    return null;
  }
}

// ---- Playback QA (the craft layer's "inspect the actual file, not the plan" gate) ----

export interface QaReport {
  ok: boolean;
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  clipping: boolean;
  sceneChanges: number;
  isStatic: boolean;
  issues: string[];
}

function probeJson(path: string): { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } } {
  const r = spawnSync(mediaBin("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8", maxBuffer: 1 << 24 });
  try { return JSON.parse(r.stdout || "{}"); } catch { return {}; }
}

/** Inspect a rendered file: duration, streams, loudness/clipping, and visual variety (scene cuts). */
export function qaPlayback(video: string): QaReport {
  const issues: string[] = [];
  const meta = probeJson(video);
  const streams = meta.streams ?? [];
  const vstream = streams.find((s) => s.codec_type === "video");
  const hasVideo = Boolean(vstream);
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  const durationSec = parseFloat(meta.format?.duration ?? "0") || 0;
  const width = vstream?.width ?? 0;
  const height = vstream?.height ?? 0;

  // loudness / clipping via volumedetect
  let meanVolumeDb: number | null = null, maxVolumeDb: number | null = null;
  if (hasAudio) {
    const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", video, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 24 });
    const err = r.stderr || "";
    const mean = err.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    const max = err.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    if (mean) meanVolumeDb = parseFloat(mean[1]!);
    if (max) maxVolumeDb = parseFloat(max[1]!);
  }
  const clipping = maxVolumeDb != null && maxVolumeDb >= -0.3;

  // visual variety: count scene changes
  let sceneChanges = 0;
  if (hasVideo) {
    const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", video, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
    sceneChanges = ((r.stderr || "").match(/Parsed_showinfo/g) || []).length;
  }
  const isStatic = hasVideo && durationSec > 3 && sceneChanges === 0;

  if (durationSec <= 0) issues.push("no readable duration");
  if (!hasVideo) issues.push("no video stream");
  if (!hasAudio) issues.push("no audio stream");
  if (clipping) issues.push(`audio clipping (max ${maxVolumeDb} dB)`);
  if (isStatic) issues.push("no visible motion/cuts across the file (static)");

  return { ok: issues.length === 0, durationSec, hasVideo, hasAudio, width, height, meanVolumeDb, maxVolumeDb, clipping, sceneChanges, isStatic, issues };
}
