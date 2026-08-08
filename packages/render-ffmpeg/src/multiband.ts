// @montara/render-ffmpeg — multiband restoration.
//
// `restore.ts` treats a take as one signal: one high-pass, one gate threshold, one denoise
// strength. Real damage is not distributed that way. Desk rumble lives below 150 Hz, mains hum sits
// in narrow lines around 50/60 Hz, room tone is broadband but strongest in the low mids, and tape or
// preamp hiss is almost entirely above 6 kHz. A single gate threshold set high enough to silence the
// hiss chews the tails off consonants; set low enough to protect the consonants it leaves the hum.
//
// So: split the take at crossovers, measure what the noise floor actually is *in each band*, and
// expand each band against its own measured floor. That is the difference between "a denoise filter
// was applied" and restoration.
//
// Two rules kept from the rest of the audio path:
//   - Measure, don't assume. Expansion is keyed to a floor read off this recording, not a constant.
//   - One dynamics stage per purpose. The per-band expanders remove noise; the single downstream
//     compressor in `restore.ts` sets level. Stacking more is what makes speech pump.
import { spawnSync } from "node:child_process";
import { mediaBin } from "./ffmpegPath";

/**
 * Crossover corners in Hz, chosen for speech rather than for music.
 *
 *   < 150     rumble, handling, HVAC, plosive energy — no speech fundamental worth keeping
 *   150-1200  fundamentals and body — the band to touch least
 *   1200-6000 consonants and presence — where over-processing is audible first
 *   > 6000    air and hiss — the band that tolerates, and needs, the most reduction
 */
export const SPEECH_CROSSOVERS = [150, 1200, 6000] as const;

export interface BandFloor {
  /** Band edges in Hz. `hi` is null for the top band. */
  lo: number;
  hi: number | null;
  /** Measured noise floor for this band, dBFS RMS. */
  floorDb: number;
  /** Loudest windowed RMS in this band, dBFS. The gap to `floorDb` is the usable range. */
  peakDb: number;
}

export interface NoiseProfile {
  crossovers: number[];
  bands: BandFloor[];
  /** Number of RMS windows measured per band. Low counts mean a short or unreadable file. */
  windows: number;
}

/** Band edges implied by a crossover list. */
export function bandEdges(crossovers: readonly number[]): Array<{ lo: number; hi: number | null }> {
  const edges: Array<{ lo: number; hi: number | null }> = [];
  let lo = 0;
  for (const corner of crossovers) {
    edges.push({ lo, hi: corner });
    lo = corner;
  }
  edges.push({ lo, hi: null });
  return edges;
}

/**
 * The quiet level of a series of windowed RMS readings.
 *
 * Not the minimum: one window that happens to land in a hard digital silence reports -inf and would
 * claim the recording has no noise at all. Not the mean either — that is dominated by speech. The
 * 10th percentile is the level the recording sits at between phrases, which is the thing an expander
 * has to be told about.
 */
export function noiseFloorOf(samples: number[], percentile = 0.1): number {
  const usable = samples.filter((value) => Number.isFinite(value));
  if (!usable.length) return -60;
  const sorted = [...usable].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentile)));
  return sorted[index]!;
}

function windowedRms(input: string, lo: number, hi: number | null): number[] {
  const band: string[] = [];
  if (lo > 0) band.push(`highpass=f=${lo}:poles=2`);
  if (hi != null) band.push(`lowpass=f=${hi}:poles=2`);
  band.push("astats=metadata=1:reset=6", "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-");

  const result = spawnSync(
    mediaBin("ffmpeg"),
    ["-v", "error", "-i", input, "-af", band.join(","), "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  const values: number[] = [];
  for (const line of (result.stdout || "").split(/\r?\n/)) {
    const match = /RMS_level=(-?[\d.]+|-inf)/.exec(line);
    if (match) values.push(match[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(match[1]));
  }
  return values;
}

/**
 * Read the noise floor of a recording, band by band.
 *
 * Returns null when ffmpeg produced no readings at all, so callers can fall back to the fixed chain
 * instead of expanding against a floor that was never measured.
 */
export function learnNoiseProfile(input: string, crossovers: readonly number[] = SPEECH_CROSSOVERS): NoiseProfile | null {
  const bands: BandFloor[] = [];
  let windows = 0;

  for (const { lo, hi } of bandEdges(crossovers)) {
    const samples = windowedRms(input, lo, hi);
    if (!samples.length) return null;
    windows = Math.max(windows, samples.length);
    const finite = samples.filter((value) => Number.isFinite(value));
    bands.push({
      lo,
      hi,
      floorDb: noiseFloorOf(samples),
      peakDb: finite.length ? Math.max(...finite) : -60,
    });
  }

  return { crossovers: [...crossovers], bands, windows };
}

/**
 * FFT denoise strength for a band, from its measured floor.
 *
 * A band sitting at -70 dB is already clean and should be left alone; one at -30 dB is audibly noisy
 * and can take a lot. Clamped at 30 because afftdn above that starts adding the watery artefacts
 * that make a restore sound worse than the damage.
 */
export function denoiseStrengthFor(floorDb: number, { max = 30 } = {}): number {
  return Math.round(Math.min(max, Math.max(0, (floorDb + 72) * 0.85)));
}

/**
 * A downward expander keyed to a measured floor.
 *
 * `compand`'s transfer function is a list of input/output dB points. Below the floor the curve
 * drops steeply so room tone is pushed toward silence; a knee 10 dB above the floor passes speech
 * untouched. The slow decay is deliberate — a fast one chatters on breaths.
 */
export function expanderFor(floorDb: number, { depthDb = 18, kneeDb = 10 } = {}): string {
  const floor = Math.max(-90, Math.min(-12, floorDb));
  const knee = Math.min(-3, floor + kneeDb);
  const crushed = Math.max(-95, floor - depthDb);
  return `compand=attacks=0.005:decays=0.25:points=-95/-95|${floor.toFixed(1)}/${crushed.toFixed(1)}|${knee.toFixed(1)}/${knee.toFixed(1)}|0/0`;
}

export interface MultibandOptions {
  /** Notch mains hum and its first two harmonics before the split. */
  dehum?: 50 | 60 | false;
  /** Skip expansion on bands already quieter than this. */
  cleanFloorDb?: number;
  /** Filters this ffmpeg build has, so a missing one costs a link and not the render. */
  available?: Set<string>;
}

/**
 * Build the `-filter_complex` body for a multiband restoration pass.
 *
 * Pure: takes a measured profile, returns a filtergraph and the label its output lands on. Keeping
 * it free of I/O is what lets the contract tests assert the graph rather than listen to a render.
 */
export function multibandGraph(
  profile: NoiseProfile,
  inLabel: string,
  outLabel: string,
  opts: MultibandOptions = {},
): string {
  const has = (name: string) => !opts.available || opts.available.has(name);
  const cleanFloor = opts.cleanFloorDb ?? -68;
  const parts: string[] = [];

  // Hum is a set of narrow lines, not a band. Notch it whole, before the split, so the crossover
  // does not smear a 50 Hz spike across two bands and force both of them to expand harder.
  const pre: string[] = [];
  if (opts.dehum && has("equalizer")) {
    for (const harmonic of [1, 2, 3]) {
      pre.push(`equalizer=f=${opts.dehum * harmonic}:width_type=q:width=24:g=-30`);
    }
  }
  if (has("adeclick")) pre.push("adeclick");
  const splitIn = pre.length ? "[pre]" : inLabel;
  if (pre.length) parts.push(`${inLabel}${pre.join(",")}[pre]`);

  const bandLabels = profile.bands.map((_, i) => `[b${i}]`);
  parts.push(`${splitIn}acrossover=split=${profile.crossovers.join("|")}:order=4th${bandLabels.join("")}`);

  const treated: string[] = [];
  profile.bands.forEach((band, i) => {
    const chain: string[] = [];

    // The sub band carries no speech, so it is high-passed rather than merely expanded.
    if (band.hi != null && band.hi <= 150 && has("highpass")) chain.push("highpass=f=70:poles=2");

    const strength = denoiseStrengthFor(band.floorDb);
    if (strength > 0 && has("afftdn")) chain.push(`afftdn=nr=${strength}:nf=${Math.round(band.floorDb)}:tn=1`);
    if (band.floorDb > cleanFloor && has("compand")) chain.push(expanderFor(band.floorDb));

    if (!chain.length) chain.push("anull");
    parts.push(`${bandLabels[i]}${chain.join(",")}[t${i}]`);
    treated.push(`[t${i}]`);
  });

  // normalize=0: the bands are complementary halves of one signal, so averaging them would drop the
  // whole take by 6 dB per split. They are summed back exactly as acrossover took them apart.
  parts.push(`${treated.join("")}amix=inputs=${treated.length}:normalize=0:duration=longest${outLabel}`);
  return parts.join(";");
}

/** Human-readable summary of what the profile found — for `montara enhance --json` and the demos. */
export function describeProfile(profile: NoiseProfile): string[] {
  return profile.bands.map((band) => {
    const range = band.hi == null ? `${band.lo}Hz+` : `${band.lo}-${band.hi}Hz`;
    return `${range}: floor ${band.floorDb.toFixed(1)}dB, peak ${band.peakDb.toFixed(1)}dB, nr ${denoiseStrengthFor(band.floorDb)}`;
  });
}
