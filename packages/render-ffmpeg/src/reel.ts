// @montara/render-ffmpeg - reel builder.
// The reel command plans creative choices into Timeline IR first; this module only renders that
// IR and applies the final loudness pass. When called directly it creates a minimal, editable
// Timeline fallback instead of baking a separate visual language into ffmpeg filters.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeHex, round3, validateTimeline, type TextClip, type Timeline, type Track } from "../../core/src/index";
import { compositeTimeline } from "./composite";
import { mediaBin } from "./ffmpegPath";

export interface Caption { startSec: number; endSec: number; text: string }

export interface ReelBeat {
  startSec: number;
  endSec: number;
  title: string;
  subtitle?: string;
  accent?: string;
}

export interface ReelVisualStyle {
  accent?: string;
  cardBackground?: string;
  captionColor?: string;
  hookColor?: string;
  endCardColor?: string;
  fontFile?: string;
  fontFamily?: string;
}

export interface ReelTimingOptions {
  hookStartSec?: number;
  hookDurationSec?: number;
  endCardDurationSec?: number;
}

export interface ReelOptions {
  hook?: string;
  endCard?: string;
  captions?: Caption[];
  /** Adds planned support graphics when the supplied Timeline contains them. */
  smart?: boolean;
  /** Optional content beats used by the direct-call Timeline fallback. */
  beats?: ReelBeat[];
  /** Loudness target. */
  lufs?: number;
  /** Visual treatment chosen by the planner or user prompt. */
  style?: ReelVisualStyle;
  /** Timing windows chosen from source analysis, transcript, or explicit user direction. */
  timing?: ReelTimingOptions;
  /** Preferred path: render this editable Timeline IR instead of constructing overlays here. */
  timeline?: Timeline;
}

export interface ReelResult { ok: boolean; path: string; captions: number; error?: string }

interface SourceProbe {
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
}

function probeSource(path: string): SourceProbe {
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json",
    path,
  ], { encoding: "utf8" });
  const probe: SourceProbe = { width: 1080, height: 1920, durationSec: 0, hasAudio: false };
  try {
    const parsed = JSON.parse(r.stdout || "{}") as {
      streams?: { codec_type?: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    for (const stream of parsed.streams ?? []) {
      if (stream.codec_type === "video") {
        probe.width = stream.width ?? probe.width;
        probe.height = stream.height ?? probe.height;
      }
      if (stream.codec_type === "audio") probe.hasAudio = true;
    }
    probe.durationSec = parseFloat(parsed.format?.duration ?? "0") || 0;
  } catch {
    // Keep the conservative vertical fallback. Rendering should degrade, not abort at probing.
  }
  return probe;
}

function cleanHex(input: string | undefined, fallback: string): string {
  return normalizeHex(input, fallback);
}

function boundedClipDuration(startSec: number, endSec: number, totalSec: number): number {
  return round3(Math.max(0.001, Math.min(totalSec, endSec) - Math.max(0, startSec)));
}

function textClip(
  id: string,
  text: string,
  startSec: number,
  durationSec: number,
  color: string,
  z: number,
  style?: ReelVisualStyle,
): TextClip | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || durationSec <= 0) return null;
  return {
    id,
    type: "text",
    startSec: round3(Math.max(0, startSec)),
    durationSec: round3(durationSec),
    text: clean,
    style: {
      color: cleanHex(color, "ffffff"),
      align: "center",
      maxWidthPct: 86,
      shadow: true,
      ...(style?.fontFamily ? { fontFamily: style.fontFamily } : {}),
    },
    z,
  };
}

function timelineFromDirectCall(input: string, opts: ReelOptions, probe: SourceProbe): Timeline {
  const durationSec = round3(Math.max(0.001, probe.durationSec || 1));
  const composition = {
    width: Math.max(16, Math.round(probe.width)),
    height: Math.max(16, Math.round(probe.height)),
    fps: 30,
    durationSec,
    background: "000000",
  };
  const video: Track = {
    id: "video-source",
    type: "video",
    clips: [{
      id: "source-footage",
      type: "video",
      source: { kind: "video", path: input },
      startSec: 0,
      durationSec,
      sourceInSec: 0,
      fit: "cover",
      z: 0,
    }],
  };
  const text: Track = { id: "text-overlays", type: "text", clips: [] };
  const accent = cleanHex(opts.style?.accent, "ffffff");

  if (opts.hook) {
    const hookStart = round3(Math.max(0, opts.timing?.hookStartSec ?? 0));
    const derivedDuration = opts.beats?.[0]
      ? boundedClipDuration(opts.beats[0].startSec, opts.beats[0].endSec, durationSec)
      : Math.max(0.001, durationSec - hookStart);
    const hookDuration = Math.min(durationSec - hookStart, opts.timing?.hookDurationSec ?? derivedDuration);
    const clip = textClip("hook", opts.hook, hookStart, hookDuration, opts.style?.hookColor ?? accent, 30, opts.style);
    if (clip) text.clips.push(clip);
  }

  for (const [index, beat] of (opts.smart ? opts.beats ?? [] : []).entries()) {
    const duration = boundedClipDuration(beat.startSec, beat.endSec, durationSec);
    const clip = textClip(
      `beat-${index + 1}`,
      beat.subtitle ? `${beat.title}: ${beat.subtitle}` : beat.title,
      beat.startSec,
      duration,
      beat.accent ?? accent,
      35,
      opts.style,
    );
    if (clip) text.clips.push(clip);
  }

  for (const [index, caption] of (opts.captions ?? []).entries()) {
    const duration = boundedClipDuration(caption.startSec, caption.endSec, durationSec);
    const clip = textClip(
      `caption-${index + 1}`,
      caption.text,
      caption.startSec,
      duration,
      opts.style?.captionColor ?? "ffffff",
      40,
      opts.style,
    );
    if (clip) text.clips.push(clip);
  }

  if (opts.endCard && opts.timing?.endCardDurationSec && opts.timing.endCardDurationSec > 0) {
    const endDuration = Math.min(durationSec, opts.timing.endCardDurationSec);
    const clip = textClip(
      "end-card",
      opts.endCard,
      durationSec - endDuration,
      endDuration,
      opts.style?.endCardColor ?? accent,
      50,
      opts.style,
    );
    if (clip) text.clips.push(clip);
  }

  const audio: Track = {
    id: "audio-source",
    type: "audio",
    clips: probe.hasAudio
      ? [{
          id: "source-audio",
          type: "audio",
          source: { kind: "file", path: input },
          startSec: 0,
          durationSec,
          volume: 1,
        }]
      : [],
  };

  return {
    version: "1.1",
    composition,
    tracks: [video, text, audio].filter((track) => track.clips.length > 0),
    metadata: {
      source: "reel_direct_call_fallback",
      render_runtime: "ffmpeg",
      renderer_family: "presenter",
      smart: opts.smart === true,
      policy: "timeline-ir-first",
    },
  };
}

function loudnessPass(input: string, outPath: string, lufs: number): { ok: boolean; error?: string } {
  const r = spawnSync(mediaBin("ffmpeg"), [
    "-y",
    "-i", input,
    "-c:v", "copy",
    "-af", `loudnorm=I=${lufs}:TP=-1:LRA=11`,
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    outPath,
  ], { encoding: "utf8", timeout: 600000, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, error: r.status === 0 ? undefined : (r.stderr || r.error?.message || "").slice(-500) };
}

/** Build a finished Reel from source media by rendering the supplied Timeline IR. */
export function buildReel(input: string, outPath: string, opts: ReelOptions = {}): ReelResult {
  const lufs = opts.lufs ?? -14;
  mkdirSync(dirname(outPath), { recursive: true });
  const work = join(tmpdir(), `montara-reel-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });

  try {
    const timeline = opts.timeline ?? timelineFromDirectCall(input, opts, probeSource(input));
    const issues = validateTimeline(timeline);
    if (issues.length) return { ok: false, path: outPath, captions: opts.captions?.length ?? 0, error: issues.join("; ") };

    const composited = join(work, "timeline.mp4");
    compositeTimeline(timeline, composited);
    const master = loudnessPass(composited, outPath, lufs);
    if (!master.ok) return { ok: false, path: outPath, captions: opts.captions?.length ?? 0, error: master.error };
    return { ok: true, path: outPath, captions: opts.captions?.length ?? 0 };
  } catch (error) {
    return { ok: false, path: outPath, captions: opts.captions?.length ?? 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* temp cleanup best effort */ }
  }
}
