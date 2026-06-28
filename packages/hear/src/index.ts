// @montara/hear — the audio-understanding boundary. Speaker differentiation (voice-ID) via
// the Resemblyzer embedding tool. Shells out to `voice_id.py` (heavy: torch) and parses JSON,
// so nothing here pulls torch into the gate. Availability is checked with importlib.find_spec
// (no torch import), keeping discovery fast.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
