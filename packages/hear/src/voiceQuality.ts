// @montara/hear — measurable voice characteristics.
//
// Montara picks narration by measurement, not vibe: profile a reference narrator, then
// match a candidate acoustically. These are the numbers that matter for that comparison —
// pace, warmth, level, and how much of the take is actually speech.
//
// Everything here is ffmpeg-only so it runs with no models installed. The measurements are
// approximations of their studio equivalents and say so in `notes`; they are for comparing
// takes against each other, not for certifying a master.

import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";

export interface VoiceQuality {
  path: string;
  durationSec: number;
  /**
   * Approximate speech onsets per second, from short-gap detection. Conversational
   * narration lands near 4-5; below ~3 reads slow, above ~6 reads rushed.
   */
  onsetsPerSec: number;
  /** Fraction of the take that is speech rather than silence, 0..1. */
  speechRatio: number;
  /** Low-band vs high-band balance, 0..1. Around 0.5 is neutral; higher is chestier. */
  warmth: number;
  meanDb: number | null;
  peakDb: number | null;
  /** How each number was derived, and where it is only an approximation. */
  notes: string[];
}

function runFilter(input: string, filter: string): string {
  const result = spawnSync(mediaBin("ffmpeg"), [
    "-hide_banner", "-nostats",
    "-i", input,
    "-af", filter,
    "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 1 << 26 });
  return result.stderr || "";
}

function parseVolumeDetect(stderr: string): { meanDb: number | null; peakDb: number | null } {
  const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const peak = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    meanDb: mean?.[1] ? Number(mean[1]) : null,
    peakDb: peak?.[1] ? Number(peak[1]) : null,
  };
}

function probeDuration(input: string): number {
  const result = spawnSync(mediaBin("ffprobe"), [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    input,
  ], { encoding: "utf8" });
  const value = Number((result.stdout || "").trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Speech onsets and speech ratio from silence gaps.
 *
 * Each silence_end marks a point where the voice restarts, so counting them across a take
 * approximates syllabic pacing. A short 60 ms window is what makes this track syllables
 * rather than sentences.
 */
function measurePacing(input: string, durationSec: number): { onsetsPerSec: number; speechRatio: number } {
  const stderr = runFilter(input, "silencedetect=noise=-30dB:d=0.06");
  const onsets = (stderr.match(/silence_end:/g) ?? []).length;
  const silences = [...stderr.matchAll(/silence_duration:\s*([\d.]+)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  const silentSec = silences.reduce((sum, value) => sum + value, 0);
  const speechRatio = durationSec > 0 ? Math.max(0, Math.min(1, 1 - silentSec / durationSec)) : 0;
  const speakingSec = durationSec * speechRatio;
  return {
    onsetsPerSec: speakingSec > 0.2 ? Math.round((onsets / speakingSec) * 100) / 100 : 0,
    speechRatio: Math.round(speechRatio * 1000) / 1000,
  };
}

/** Low-band vs high-band energy, normalised to 0..1. */
function measureWarmth(input: string): number {
  const low = parseVolumeDetect(runFilter(input, "bandpass=f=290:width_type=h:width=420,volumedetect")).meanDb;
  const high = parseVolumeDetect(runFilter(input, "bandpass=f=5000:width_type=h:width=6000,volumedetect")).meanDb;
  if (low == null || high == null) return 0.5;
  // A +/-20 dB spread covers everything from thin to boomy; map it onto 0..1.
  return Math.round(Math.max(0, Math.min(1, (low - high + 20) / 40)) * 1000) / 1000;
}

/** Profile a narration take so it can be matched against a reference acoustically. */
export function measureVoiceQuality(input: string): VoiceQuality {
  const durationSec = probeDuration(input);
  const { meanDb, peakDb } = parseVolumeDetect(runFilter(input, "volumedetect"));
  const { onsetsPerSec, speechRatio } = measurePacing(input, durationSec);
  const warmth = measureWarmth(input);

  const notes: string[] = [
    "onsetsPerSec is gap-derived, not a spectral-flux onset detector; use it to compare takes.",
    "warmth is a two-band energy ratio (290 Hz vs 5 kHz), not a full spectral profile.",
  ];
  if (durationSec <= 0) notes.push("duration could not be read; the file may not contain audio.");
  if (onsetsPerSec > 0 && onsetsPerSec < 3) notes.push("Pace reads slow for narration; target roughly 4-5 onsets/s.");
  if (onsetsPerSec > 6) notes.push("Pace reads rushed for narration; target roughly 4-5 onsets/s.");
  if (speechRatio > 0 && speechRatio < 0.5) notes.push("Over half the take is silence; trim before matching.");

  return { path: input, durationSec, onsetsPerSec, speechRatio, warmth, meanDb, peakDb, notes };
}

export interface VoiceMatch {
  /** 0..1 acoustic similarity across pace, warmth, and level. */
  score: number;
  paceDelta: number;
  warmthDelta: number;
  levelDeltaDb: number | null;
  verdict: "match" | "close" | "different";
}

/** Compare a candidate narrator against a profiled reference. */
export function matchVoice(reference: VoiceQuality, candidate: VoiceQuality): VoiceMatch {
  const paceDelta = Math.round((candidate.onsetsPerSec - reference.onsetsPerSec) * 100) / 100;
  const warmthDelta = Math.round((candidate.warmth - reference.warmth) * 1000) / 1000;
  const levelDeltaDb = reference.meanDb != null && candidate.meanDb != null
    ? Math.round((candidate.meanDb - reference.meanDb) * 10) / 10
    : null;

  // Pace dominates perceived similarity, then tone, then level (which mastering fixes anyway).
  const paceScore = Math.max(0, 1 - Math.abs(paceDelta) / 3);
  const warmthScore = Math.max(0, 1 - Math.abs(warmthDelta) / 0.3);
  const levelScore = levelDeltaDb == null ? 0.5 : Math.max(0, 1 - Math.abs(levelDeltaDb) / 12);
  const score = Math.round((paceScore * 0.5 + warmthScore * 0.35 + levelScore * 0.15) * 1000) / 1000;

  return {
    score,
    paceDelta,
    warmthDelta,
    levelDeltaDb,
    verdict: score >= 0.8 ? "match" : score >= 0.6 ? "close" : "different",
  };
}
