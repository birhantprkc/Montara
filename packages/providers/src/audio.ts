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
  /**
   * Duck the beds with a real sidechain compressor keyed off track 0 instead of a fixed gain.
   *
   * A fixed gain holds the bed down for the whole cut, so the music never breathes and the
   * narration sits on a flat pad. A sidechain only pulls the bed down while the voice is actually
   * speaking and lets it swell back in the gaps — that "breathing" is most of what separates a
   * scored piece from a voice-over-music one.
   */
  sidechain?: boolean;
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
  const sidechain = Boolean(input.sidechain) && input.tracks.length > 1;
  input.tracks.forEach((t, i) => {
    // With a real sidechain the compressor does the ducking, so don't also pre-attenuate.
    const duck = input.duckUnderFirst && !sidechain && i > 0 ? 0.45 : 1;
    const volume = Math.max(0, (t.volume ?? 1) * duck);
    const delayMs = Math.max(0, Math.round((t.delaySec ?? 0) * 1000));
    const label = `a${i}`;
    filters.push(`[${i}:a]volume=${volume.toFixed(3)},adelay=${delayMs}:all=1[${label}]`);
    labels.push(`[${label}]`);
  });

  if (sidechain) {
    // Track 0 is both program and the key, so it has to be split before either use.
    filters.push(`[a0]asplit=2[key][voice]`);
    const beds = labels.slice(1).join("");
    const bedMix =
      input.tracks.length > 2
        ? `${beds}amix=inputs=${input.tracks.length - 1}:normalize=0:duration=longest[beds]`
        : `[a1]anull[beds]`;
    filters.push(bedMix);
    // Slow release so the bed rises back between sentences rather than pumping between words.
    filters.push(`[beds][key]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=450:makeup=1[ducked]`);
    filters.push(`[voice][ducked]amix=inputs=2:normalize=0:duration=longest[mix]`);
  } else {
    filters.push(`${labels.join("")}amix=inputs=${input.tracks.length}:normalize=0:duration=longest[mix]`);
  }

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
    metadata: {
      trackCount: input.tracks.length,
      ducked: Boolean(input.duckUnderFirst) || sidechain,
      sidechain,
    },
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
