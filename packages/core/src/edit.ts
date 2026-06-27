// @montara/core — editable Timeline IR operations.
// Pure, immutable transforms on the one IR: add / remove / split / trim / move / retime /
// recolor / set-text. Every op returns a NEW Timeline with composition.durationSec recomputed
// so the result stays valid. This is the moat the source engine lacks: a timeline a human
// (or a GUI, or an agent) can edit between build and render, then re-render the diff.

import { normalizeHex, round3, type Clip, type Timeline } from "./types";

/** End time (start + duration) of a clip, rounded to ms. */
export function clipEnd(clip: Clip): number {
  return round3(clip.startSec + clip.durationSec);
}

/** Locate a clip by id across all tracks. */
export function findClip(timeline: Timeline, clipId: string): { clip: Clip; trackId: string } | null {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, trackId: track.id };
  }
  return null;
}

/** Recompute composition.durationSec from the furthest clip end (keeps the IR valid after edits). */
export function recomputeDuration(timeline: Timeline): Timeline {
  let max = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) max = Math.max(max, clip.startSec + clip.durationSec);
  }
  return { ...timeline, composition: { ...timeline.composition, durationSec: round3(Math.max(max, 0.001)) } };
}

/** Replace a single clip (by id) via a transform, then recompute duration. */
function mapClip(timeline: Timeline, clipId: string, fn: (clip: Clip) => Clip): Timeline {
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => (clip.id === clipId ? fn(clip) : clip)),
  }));
  return recomputeDuration({ ...timeline, tracks });
}

/** Append a clip to a track. */
export function addClip(timeline: Timeline, trackId: string, clip: Clip): Timeline {
  const tracks = timeline.tracks.map((track) =>
    track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track,
  );
  return recomputeDuration({ ...timeline, tracks });
}

/** Remove a clip by id. */
export function removeClip(timeline: Timeline, clipId: string): Timeline {
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.id !== clipId),
  }));
  return recomputeDuration({ ...timeline, tracks });
}

/** Move a clip to a new start time (clamped to >= 0). */
export function moveClip(timeline: Timeline, clipId: string, startSec: number): Timeline {
  return mapClip(timeline, clipId, (clip) => ({ ...clip, startSec: round3(Math.max(0, startSec)) }));
}

/** Trim a clip's start and/or duration. */
export function trimClip(timeline: Timeline, clipId: string, opts: { startSec?: number; durationSec?: number }): Timeline {
  return mapClip(timeline, clipId, (clip) => ({
    ...clip,
    startSec: opts.startSec != null ? round3(Math.max(0, opts.startSec)) : clip.startSec,
    durationSec: opts.durationSec != null ? round3(Math.max(0.001, opts.durationSec)) : clip.durationSec,
  }));
}

/** Set a clip's duration (alias of trim by duration). */
export function retimeClip(timeline: Timeline, clipId: string, durationSec: number): Timeline {
  return trimClip(timeline, clipId, { durationSec });
}

/** Recolor a solid (video) clip's background. No-op on other clip types. */
export function recolorClip(timeline: Timeline, clipId: string, color: string): Timeline {
  return mapClip(timeline, clipId, (clip) =>
    clip.type === "video" && clip.source.kind === "solid"
      ? { ...clip, source: { ...clip.source, color: normalizeHex(color) } }
      : clip,
  );
}

/** Set a text clip's text. No-op on other clip types. */
export function setClipText(timeline: Timeline, clipId: string, text: string): Timeline {
  return mapClip(timeline, clipId, (clip) => (clip.type === "text" ? { ...clip, text } : clip));
}

/** Split a clip into two at an absolute time. No-op if the split is outside the clip. */
export function splitClip(timeline: Timeline, clipId: string, atSec: number): Timeline {
  const found = findClip(timeline, clipId);
  if (!found) return timeline;
  const { clip } = found;
  const start = clip.startSec;
  const end = clip.startSec + clip.durationSec;
  if (atSec <= start || atSec >= end) return timeline;

  const left = { ...clip, id: `${clip.id}-a`, durationSec: round3(atSec - start) } as Clip;
  const right = { ...clip, id: `${clip.id}-b`, startSec: round3(atSec), durationSec: round3(end - atSec) } as Clip;
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
  }));
  return recomputeDuration({ ...timeline, tracks });
}
