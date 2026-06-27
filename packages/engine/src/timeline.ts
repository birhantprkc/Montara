// @montara/engine — Timeline-IR bridge.
// Maps the engine's composition format (a list of `cuts`, the same props the Remotion
// composer renders) onto Montara's existing Timeline IR — and back. There is NO parallel
// Montara-only video format: the engine's cuts become Track/Clip on the one IR, validated
// by the same `validateTimeline` every renderer compiles.

import {
  normalizeHex,
  round3,
  type SolidClip,
  type TextClip,
  type Timeline,
  type Track,
} from "../../core/src/index";

export interface EngineCut {
  id: string;
  source?: string;
  type?: string;
  in_seconds: number;
  out_seconds: number;
  text?: string;
  subtitle?: string;
  backgroundColor?: string;
}

export interface EngineComposition {
  theme?: Record<string, unknown>;
  cuts: EngineCut[];
  overlays?: unknown[];
  captions?: unknown[];
  audio?: Record<string, unknown> | null;
  width?: number;
  height?: number;
  fps?: number;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;

/** Convert an engine composition (cuts) into a valid Montara Timeline IR. */
export function engineCompositionToTimeline(comp: EngineComposition): Timeline {
  const width = Math.max(16, Math.round(comp.width ?? DEFAULT_WIDTH));
  const height = Math.max(16, Math.round(comp.height ?? DEFAULT_HEIGHT));
  const fps = Math.max(1, Math.round(comp.fps ?? DEFAULT_FPS));
  const cuts = [...(comp.cuts ?? [])].sort((a, b) => a.in_seconds - b.in_seconds);

  const video: Track = { id: "video-1", type: "video", clips: [] };
  const text: Track = { id: "text-1", type: "text", clips: [] };
  let maxEnd = 0;

  for (const cut of cuts) {
    const startSec = round3(Math.max(0, cut.in_seconds));
    const durationSec = round3(Math.max(0, cut.out_seconds - cut.in_seconds));
    if (durationSec <= 0) continue;
    const id = cut.id || `cut-${video.clips.length + 1}`;
    maxEnd = Math.max(maxEnd, startSec + durationSec);

    const solid: SolidClip = {
      id: `${id}-solid`,
      type: "video",
      startSec,
      durationSec,
      source: { kind: "solid", color: normalizeHex(cut.backgroundColor) },
      label: cut.type || (cut.text ?? "").trim() || id,
      transitionOut: { kind: "cut", durationSec: 0 },
    };
    video.clips.push(solid);

    const label = (cut.text ?? "").trim();
    if (label) {
      const textClip: TextClip = {
        id: `${id}-text`,
        type: "text",
        startSec,
        durationSec,
        text: label,
        style: {
          fontFamily: "Arial",
          fontSize: Math.max(24, Math.round(height * 0.078)),
          color: "ffffff",
          align: "center",
          maxWidthPct: 78,
          shadow: true,
        },
        transform: { x: width / 2, y: height / 2, opacity: 1 },
      };
      text.clips.push(textClip);
    }
  }

  const durationSec = round3(Math.max(maxEnd, 0.001));
  return {
    version: "1.1",
    composition: { width, height, fps, durationSec, background: "0a0a0a" },
    tracks: text.clips.length ? [video, text] : [video],
    metadata: { source: "engine-composition", cutCount: video.clips.length },
  };
}

/** Convert a Montara Timeline IR back into the engine composition (cuts) format. */
export function timelineToEngineComposition(timeline: Timeline): EngineComposition {
  const textClips = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip): clip is TextClip => clip.type === "text")
    .sort((a, b) => a.startSec - b.startSec);

  const cuts: EngineCut[] = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip): clip is SolidClip => clip.type === "video" && clip.source.kind === "solid")
    .sort((a, b) => a.startSec - b.startSec)
    .map((clip, index) => {
      const overlap = textClips.find(
        (t) => t.startSec < clip.startSec + clip.durationSec && t.startSec + t.durationSec > clip.startSec,
      );
      return {
        id: clip.id.replace(/-solid$/, "") || `cut-${index + 1}`,
        source: "",
        type: clip.label || "scene",
        in_seconds: clip.startSec,
        out_seconds: round3(clip.startSec + clip.durationSec),
        text: overlap?.text ?? "",
        backgroundColor: `#${clip.source.color}`,
      };
    });

  return { cuts };
}
