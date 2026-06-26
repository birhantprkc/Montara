// @montara/core - scene plans, Timeline IR, and pure timeline ops.
// The IR is intentionally renderer-neutral: composers enrich it, renderers compile it.

export interface Scene {
  id: string;
  title: string;
  durationSec: number;
  /** Hex without "#", e.g. "0a0a0a". Optional -> near-black default. */
  background?: string;
}

export interface ScenePlan {
  width: number;
  height: number;
  fps: number;
  scenes: Scene[];
}

export type TimelineVersion = "1.1";
export type TrackType = "video" | "audio" | "text";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface Composition {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  background: string;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotateDeg: number;
  opacity: number;
}

export interface Keyframe<T = number> {
  atSec: number;
  value: T;
  easing?: Easing;
}

export interface ClipTransition {
  kind: "cut" | "fade" | "crossfade";
  durationSec: number;
}

export interface ClipBase {
  id: string;
  type: TrackType;
  startSec: number;
  durationSec: number;
  transform?: Partial<Transform>;
  keyframes?: Record<string, Keyframe[]>;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
}

export interface SolidClip extends ClipBase {
  type: "video";
  source: { kind: "solid"; color: string };
  label?: string;
}

export interface TextClip extends ClipBase {
  type: "text";
  text: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    align?: "left" | "center" | "right";
    maxWidthPct?: number;
    shadow?: boolean;
  };
}

export interface AudioClip extends ClipBase {
  type: "audio";
  source: { kind: "silence" } | { kind: "file"; path: string };
  volume?: number;
}

export type Clip = SolidClip | TextClip | AudioClip;

export interface Track {
  id: string;
  type: TrackType;
  clips: Clip[];
}

export interface Timeline {
  version: TimelineVersion;
  composition: Composition;
  tracks: Track[];
  metadata?: Record<string, string | number | boolean>;
}

export interface RenderOptions {
  outPath: string;
  engine?: string;
}

export interface RenderAdapter {
  id: string;
  render(timeline: Timeline, opts: RenderOptions): string | Promise<string>;
}

/** Total runtime of a plan in seconds. Pure - the kind of op the verify harness asserts. */
export function totalDuration(plan: ScenePlan): number {
  return plan.scenes.reduce((sum, s) => sum + Math.max(0, s.durationSec), 0);
}

/** Round to ms - shared rounding so timings stay stable across ops. */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function normalizeHex(input: string | undefined, fallback = "0a0a0a"): string {
  const raw = (input || fallback).replace(/^#/, "").trim().toLowerCase();
  return /^[0-9a-f]{6}$/.test(raw) ? raw : fallback;
}

export function secondsToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

export function timelineDuration(timeline: Timeline): number {
  const clipEnd = timeline.tracks.reduce((trackMax, track) => {
    const maxInTrack = track.clips.reduce(
      (clipMax, clip) => Math.max(clipMax, clip.startSec + clip.durationSec),
      0,
    );
    return Math.max(trackMax, maxInTrack);
  }, 0);
  return round3(Math.max(timeline.composition.durationSec, clipEnd));
}

export function scenePlanToTimeline(plan: ScenePlan): Timeline {
  const width = Math.max(16, Math.round(plan.width));
  const height = Math.max(16, Math.round(plan.height));
  const fps = Math.max(1, Math.round(plan.fps));
  let cursor = 0;
  const video: Track = { id: "video-1", type: "video", clips: [] };
  const text: Track = { id: "text-1", type: "text", clips: [] };

  for (const scene of plan.scenes) {
    const durationSec = round3(Math.max(0, scene.durationSec));
    if (durationSec <= 0) continue;
    const startSec = round3(cursor);
    const id = scene.id || `scene-${video.clips.length + 1}`;
    const bg = normalizeHex(scene.background);

    video.clips.push({
      id: `${id}-solid`,
      type: "video",
      startSec,
      durationSec,
      source: { kind: "solid", color: bg },
      label: scene.title,
      transitionOut: { kind: "cut", durationSec: 0 },
    });

    if (scene.title.trim()) {
      text.clips.push({
        id: `${id}-title`,
        type: "text",
        startSec,
        durationSec,
        text: scene.title.trim(),
        style: {
          fontFamily: "Arial",
          fontSize: Math.max(24, Math.round(height * 0.078)),
          color: "ffffff",
          align: "center",
          maxWidthPct: 78,
          shadow: true,
        },
        transform: {
          x: width / 2,
          y: height / 2,
          opacity: 1,
        },
      });
    }

    cursor = round3(cursor + durationSec);
  }

  const durationSec = round3(cursor);
  return {
    version: "1.1",
    composition: {
      width,
      height,
      fps,
      durationSec,
      background: "0a0a0a",
    },
    tracks: text.clips.length ? [video, text] : [video],
    metadata: {
      source: "scene-plan",
      sceneCount: video.clips.length,
    },
  };
}

export function timelineToScenePlan(timeline: Timeline): ScenePlan {
  const textClips = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip): clip is TextClip => clip.type === "text")
    .sort((a, b) => a.startSec - b.startSec);

  const scenes = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip): clip is SolidClip => clip.type === "video" && clip.source.kind === "solid")
    .sort((a, b) => a.startSec - b.startSec)
    .map((clip, index) => {
      const titleClip = textClips.find(
        (text) => text.startSec < clip.startSec + clip.durationSec && text.startSec + text.durationSec > clip.startSec,
      );
      return {
        id: clip.id.replace(/-solid$/, "") || `scene-${index + 1}`,
        title: titleClip?.text || clip.label || `Scene ${index + 1}`,
        durationSec: clip.durationSec,
        background: clip.source.color,
      };
    });

  return {
    width: timeline.composition.width,
    height: timeline.composition.height,
    fps: timeline.composition.fps,
    scenes,
  };
}

export function validateTimeline(timeline: Timeline): string[] {
  const issues: string[] = [];
  const comp = timeline.composition;
  if (timeline.version !== "1.1") issues.push(`unsupported timeline version ${timeline.version}`);
  if (!Number.isFinite(comp.width) || comp.width <= 0) issues.push("composition.width must be positive");
  if (!Number.isFinite(comp.height) || comp.height <= 0) issues.push("composition.height must be positive");
  if (!Number.isFinite(comp.fps) || comp.fps <= 0) issues.push("composition.fps must be positive");
  if (!Number.isFinite(comp.durationSec) || comp.durationSec <= 0) issues.push("composition.durationSec must be positive");
  if (!timeline.tracks.length) issues.push("timeline must contain at least one track");

  for (const track of timeline.tracks) {
    if (!track.id) issues.push("track.id is required");
    for (const clip of track.clips) {
      if (clip.type !== track.type) issues.push(`clip ${clip.id} type ${clip.type} is on ${track.type} track`);
      if (!clip.id) issues.push("clip.id is required");
      if (!Number.isFinite(clip.startSec) || clip.startSec < 0) issues.push(`clip ${clip.id} startSec must be >= 0`);
      if (!Number.isFinite(clip.durationSec) || clip.durationSec <= 0) issues.push(`clip ${clip.id} durationSec must be > 0`);
      if (clip.startSec + clip.durationSec > comp.durationSec + 0.01) {
        issues.push(`clip ${clip.id} exceeds composition duration`);
      }
    }
  }

  return issues;
}
