// @montara/providers — audio mixer + enhancer (§E, real ffmpeg).
// These run locally and offline: multi-track mixing with per-track gain/delay/ducking, and an
// enhance pass (high-pass + denoise + loudness normalization). No keys, no network.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolRunResult } from "./index";
import { mediaBin } from "../../render-ffmpeg/src/index";

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || "").slice(-800);
    throw new Error(`${bin} failed (exit ${r.status}): ${tail}`);
  }
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export interface MixTrack {
  path: string;
  /** linear gain, 1 = unchanged */
  volume?: number;
  /** start offset in seconds */
  delaySec?: number;
}

export interface MixInput {
  tracks: MixTrack[];
  outPath: string;
  /** when true, later tracks duck under the first (sidechain-style gain) */
  duckUnderFirst?: boolean;
}

/** Mix N audio files into one. Per-track volume + delay; optional ducking of beds under track 0. */
export function mixAudioTracks(input: MixInput): ToolRunResult {
  if (input.tracks.length === 0) throw new Error("mixAudioTracks requires at least one track");
  ensureParent(input.outPath);
  const ff = mediaBin("ffmpeg");

  const args: string[] = ["-y"];
  for (const t of input.tracks) args.push("-i", t.path);

  const labels: string[] = [];
  const filters: string[] = [];
  input.tracks.forEach((t, i) => {
    const duck = input.duckUnderFirst && i > 0 ? 0.45 : 1;
    const volume = Math.max(0, (t.volume ?? 1) * duck);
    const delayMs = Math.max(0, Math.round((t.delaySec ?? 0) * 1000));
    const label = `a${i}`;
    filters.push(`[${i}:a]volume=${volume.toFixed(3)},adelay=${delayMs}:all=1[${label}]`);
    labels.push(`[${label}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${input.tracks.length}:normalize=0:duration=longest[mix]`);

  run(ff, [
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[mix]",
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
    input.outPath,
  ]);

  return {
    toolId: "local.audio-mixer",
    artifacts: [{ kind: "audio", path: input.outPath }],
    metadata: { trackCount: input.tracks.length, ducked: Boolean(input.duckUnderFirst) },
  };
}

export interface EnhanceInput {
  inputPath: string;
  outPath: string;
  /** integrated loudness target in LUFS, default -14 (streaming standard) */
  targetLufs?: number;
}

/** High-pass + spectral denoise + loudness normalization to a target LUFS. */
export function enhanceAudio(input: EnhanceInput): ToolRunResult {
  ensureParent(input.outPath);
  const target = input.targetLufs ?? -14;
  run(mediaBin("ffmpeg"), [
    "-y",
    "-i", input.inputPath,
    "-af", `highpass=f=80,afftdn=nf=-25,loudnorm=I=${target}:TP=-1.5:LRA=11`,
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
    input.outPath,
  ]);
  return {
    toolId: "local.audio-enhance",
    artifacts: [{ kind: "audio", path: input.outPath }],
    metadata: { targetLufs: target },
  };
}
