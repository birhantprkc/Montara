// @montara/render-ffmpeg — voice restoration and enhancement.
//
// This is the pass that makes a laptop-mic recording sound produced: gate the room, notch
// mains hum, denoise, tame sibilance, shape tone, then ONE gentle compressor.
//
// Deliberately no loudnorm here. Montara masters once, in master.ts — stacking a second
// loudness stage on top of this chain is what makes narration pump.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { mediaBin } from "./ffmpegPath";
import { describeProfile, learnNoiseProfile, multibandGraph, type NoiseProfile } from "./multiband";

export type DenoiseLevel = "off" | "light" | "medium" | "strong";

export interface VoiceRestoreOptions {
  /** FFT denoise strength. Strong is audible on music beds — keep it for speech. */
  denoise?: DenoiseLevel;
  /**
   * Path to an RNNoise model (.rnnn). When set, the learned denoiser replaces afftdn:
   * markedly better on speech recorded in a live room.
   */
  rnnoiseModel?: string;
  /** Notch mains hum and its first harmonics. 50 for EU/Asia, 60 for the Americas. */
  dehum?: 50 | 60 | false;
  /** Gate threshold in dB. Silences room tone between phrases. */
  gateDb?: number;
  /** High-pass corner in Hz. Removes desk rumble and plosive energy. */
  highpassHz?: number;
  /** Tame sibilance. */
  deess?: boolean;
  /** Presence lift at 3.2 kHz, in dB. Intelligibility without harshness. */
  presenceDb?: number;
  /** Body at 180 Hz, in dB. */
  warmthDb?: number;
  /** Cut boxiness at 300 Hz, in dB (positive value = amount cut). */
  mudCutDb?: number;
  /** One gentle compressor for consistent level. */
  compress?: boolean;
  sampleRate?: number;
  /**
   * Split the take into speech bands, measure each band's own noise floor, and expand each against
   * it before the tone chain runs. Costs one measurement pass per band and is what separates a
   * restoration from "a denoise filter was applied" — see multiband.ts.
   */
  multiband?: boolean;
}

const DENOISE_NR: Record<Exclude<DenoiseLevel, "off">, number> = {
  light: 6,
  medium: 12,
  strong: 20,
};

/**
 * The ordered filter chain for a voice restoration pass.
 *
 * Pure: no ffmpeg, no I/O. Order is the craft — clean before you shape, shape before you
 * compress, so the compressor reacts to the finished tone rather than to noise.
 */
export function voiceFilterChain(opts: VoiceRestoreOptions = {}): string[] {
  return [...cleanupChain(opts), ...shapingChain(opts)];
}

/**
 * The repair half: remove what should not be there.
 *
 * Broadband, one threshold for the whole spectrum. `multibandGraph` replaces this stage when the
 * caller asks for it, which is why the two halves are separable functions rather than one list.
 */
export function cleanupChain(opts: VoiceRestoreOptions = {}): string[] {
  const chain: string[] = [];

  const highpass = opts.highpassHz ?? 80;
  if (highpass > 0) chain.push(`highpass=f=${highpass}`);

  if (opts.dehum) {
    for (const harmonic of [1, 2, 3]) {
      chain.push(`equalizer=f=${opts.dehum * harmonic}:width_type=q:width=20:g=-24`);
    }
  }

  if (opts.gateDb != null) {
    chain.push(`agate=threshold=${dbToLinear(opts.gateDb).toFixed(6)}:ratio=2:attack=10:release=250`);
  }

  if (opts.rnnoiseModel) {
    chain.push(`arnndn=m=${opts.rnnoiseModel.replace(/\\/g, "/")}`);
  } else {
    const level = opts.denoise ?? "medium";
    if (level !== "off") chain.push(`afftdn=nr=${DENOISE_NR[level]}:nf=-28:tn=1`);
  }

  return chain;
}

/**
 * The tone half: shape what is left, then set level once.
 *
 * Always runs, whichever repair stage preceded it — a compressor should react to finished tone, and
 * the limiter is the last thing to touch the signal either way.
 */
export function shapingChain(opts: VoiceRestoreOptions = {}): string[] {
  const chain: string[] = [];

  if (opts.deess !== false) chain.push("deesser=i=0.4:m=0.5:f=0.5:s=o");

  const mud = opts.mudCutDb ?? 2;
  if (mud > 0) chain.push(`equalizer=f=300:width_type=q:width=1:g=-${mud}`);
  const warmth = opts.warmthDb ?? 1.5;
  if (warmth !== 0) chain.push(`equalizer=f=180:width_type=q:width=1:g=${warmth}`);
  const presence = opts.presenceDb ?? 3;
  if (presence !== 0) chain.push(`equalizer=f=3200:width_type=q:width=1.2:g=${presence}`);

  if (opts.compress !== false) {
    chain.push("acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=2");
  }
  chain.push("alimiter=limit=0.95");

  return chain;
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

let filterCache: Set<string> | null = null;

/** Filters this ffmpeg build actually has. Cached: the probe costs a process spawn. */
export function availableAudioFilters(): Set<string> {
  if (filterCache) return filterCache;
  const result = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-filters"], {
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
  const names = new Set<string>();
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    // "TS. afftdn  A->A  Denoise audio samples using FFT." — the flag column is inconsistent
    // across builds (dots vs spaces), so anchor on the stable "A->A" signature instead and
    // take the token in front of it.
    const parts = line.trim().split(/\s+/);
    const arrow = parts.findIndex((part) => /^[AVN|]+->[AVN|]+$/.test(part));
    const name = arrow > 0 ? parts[arrow - 1] : undefined;
    if (name && /^[a-z0-9_]+$/i.test(name)) names.add(name);
  }
  filterCache = names;
  return names;
}

/** Reset the probe cache. Tests use this; production never needs it. */
export function resetFilterCache(): void {
  filterCache = null;
}

/**
 * Drop filters this build does not ship.
 *
 * `deesser` and `arnndn` are absent from some distro builds. A missing filter must cost
 * us one link in the chain, not the whole render.
 */
export function supportedFilters(chain: string[], available: Set<string>): string[] {
  if (!available.size) return chain; // probe failed — trust the chain rather than strip it
  return chain.filter((entry) => {
    const name = entry.split("=")[0] ?? entry;
    return available.has(name);
  });
}

export interface VoiceRestoreResult {
  ok: boolean;
  outPath: string;
  /** The chain actually applied, after dropping anything this ffmpeg build lacks. */
  filters: string[];
  /** Filters requested but unavailable in this build. */
  skipped: string[];
  /** Per-band noise floors, when the multiband path ran. */
  profile?: NoiseProfile;
  /** One line per band: what was measured and what was done about it. */
  bands?: string[];
  error?: string;
}

/**
 * Clean and enhance a voice track. Output is restored audio at the source loudness —
 * run `masterAudio` afterwards to land it at -14 LUFS.
 */
export function restoreVoice(
  input: string,
  outPath: string,
  opts: VoiceRestoreOptions = {},
): VoiceRestoreResult {
  mkdirSync(dirname(outPath), { recursive: true });
  const available = availableAudioFilters();

  // The multiband path needs `acrossover` to split and a measurable file to learn from. If either is
  // missing this quietly becomes the broadband chain rather than failing the render.
  const profile = opts.multiband && (!available.size || available.has("acrossover"))
    ? learnNoiseProfile(input) ?? undefined
    : undefined;

  const shaping = supportedFilters(shapingChain(opts), available);
  const requested = profile ? shapingChain(opts) : voiceFilterChain(opts);
  const filters = profile ? shaping : supportedFilters(requested, available);
  const skipped = requested.filter((entry) => !filters.includes(entry));

  if (!filters.length && !profile) {
    return { ok: false, outPath, filters, skipped, error: "no usable audio filters in this ffmpeg build" };
  }

  const args = ["-y", "-v", "error", "-i", input];
  if (profile) {
    const graph = multibandGraph(profile, "[0:a]", "[clean]", { dehum: opts.dehum, available });
    const tail = filters.length ? `;[clean]${filters.join(",")}[out]` : "";
    args.push("-filter_complex", `${graph}${tail}`, "-map", tail ? "[out]" : "[clean]");
  } else {
    args.push("-af", filters.join(","));
  }
  args.push("-ar", String(opts.sampleRate ?? 48000), "-c:a", "pcm_s16le", outPath);

  const result = spawnSync(mediaBin("ffmpeg"), args, { encoding: "utf8", maxBuffer: 1 << 26 });

  if (result.status !== 0) {
    return {
      ok: false,
      outPath,
      filters,
      skipped,
      profile,
      error: (result.stderr || result.error?.message || `exit ${result.status}`).slice(-600),
    };
  }
  return { ok: true, outPath, filters, skipped, profile, bands: profile ? describeProfile(profile) : undefined };
}
