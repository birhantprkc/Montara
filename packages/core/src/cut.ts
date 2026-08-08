// @montara/core — professional editorial operations on the Timeline IR.
//
// edit.ts covers the primitive edits (add, move, trim, split). This module covers the ones
// an editor actually reaches for at the trim bar, where the point is what happens to the
// *neighbours*: ripple, roll, slip, slide, and the split edits (J/L cuts) that stop every
// transition landing on a hard simultaneous picture-and-sound change.
//
// Pure and immutable, like everything else in core. No I/O.

import { clipEnd, findClip, recomputeDuration } from "./edit";
import { isMediaClip, round3, type Clip, type Timeline, type Track } from "./types";

/** Clips on a track in play order. */
function ordered(track: Track): Clip[] {
  return [...track.clips].sort((a, b) => a.startSec - b.startSec);
}

function trackOf(timeline: Timeline, clipId: string): Track | null {
  return timeline.tracks.find((track) => track.clips.some((clip) => clip.id === clipId)) ?? null;
}

function withTrack(timeline: Timeline, trackId: string, clips: Clip[]): Timeline {
  return recomputeDuration({
    ...timeline,
    tracks: timeline.tracks.map((track) => (track.id === trackId ? { ...track, clips } : track)),
  });
}

/** Shift a clip in time, carrying its source in-point only when it should move with it. */
function shifted(clip: Clip, deltaSec: number): Clip {
  return { ...clip, startSec: round3(Math.max(0, clip.startSec + deltaSec)) };
}

/**
 * Delete a clip and close the hole: everything later on that track slides back by the
 * deleted duration. The alternative (a lift) leaves a gap, which is almost never what you
 * want mid-sequence.
 */
export function rippleDelete(timeline: Timeline, clipId: string): Timeline {
  const track = trackOf(timeline, clipId);
  const found = findClip(timeline, clipId);
  if (!track || !found) return timeline;

  const gap = found.clip.durationSec;
  const clips = ordered(track)
    .filter((clip) => clip.id !== clipId)
    .map((clip) => (clip.startSec >= found.clip.startSec ? shifted(clip, -gap) : clip));
  return withTrack(timeline, track.id, clips);
}

/**
 * Trim a clip's out-point and pull the rest of the track with it, so the sequence gets
 * shorter or longer but no gap opens. Negative `deltaSec` shortens.
 */
export function rippleTrim(timeline: Timeline, clipId: string, deltaSec: number): Timeline {
  const track = trackOf(timeline, clipId);
  const found = findClip(timeline, clipId);
  if (!track || !found) return timeline;

  const nextDuration = round3(Math.max(0.001, found.clip.durationSec + deltaSec));
  const applied = round3(nextDuration - found.clip.durationSec);
  const boundary = clipEnd(found.clip);
  const clips = ordered(track).map((clip) => {
    if (clip.id === clipId) return { ...clip, durationSec: nextDuration };
    return clip.startSec >= boundary ? shifted(clip, applied) : clip;
  });
  return withTrack(timeline, track.id, clips);
}

/**
 * Move the cut point between two adjacent clips without changing the sequence duration:
 * one grows by exactly what the other loses. Positive `deltaSec` moves the cut later.
 */
export function rollEdit(timeline: Timeline, leftId: string, rightId: string, deltaSec: number): Timeline {
  const track = trackOf(timeline, leftId);
  const left = findClip(timeline, leftId)?.clip;
  const right = findClip(timeline, rightId)?.clip;
  if (!track || !left || !right) return timeline;
  if (trackOf(timeline, rightId)?.id !== track.id) return timeline;
  if (Math.abs(clipEnd(left) - right.startSec) > 0.002) return timeline; // not adjacent

  // Clamp so neither side collapses past a single frame's worth of time.
  const minimum = 0.001;
  const delta = round3(Math.max(minimum - left.durationSec, Math.min(right.durationSec - minimum, deltaSec)));
  if (delta === 0) return timeline;

  const clips = ordered(track).map((clip) => {
    if (clip.id === leftId) return { ...clip, durationSec: round3(clip.durationSec + delta) };
    if (clip.id !== rightId) return clip;
    const moved: Clip = { ...clip, startSec: round3(clip.startSec + delta), durationSec: round3(clip.durationSec - delta) };
    // The right clip keeps its screen position, so its source in-point moves with the cut.
    if (isMediaClip(clip) && clip.source.kind === "video" && isMediaClip(moved)) {
      moved.sourceInSec = round3(Math.max(0, (clip.sourceInSec ?? 0) + delta));
    }
    return moved;
  });
  return withTrack(timeline, track.id, clips);
}

/**
 * Slip a clip: change which part of the source plays without moving the clip or changing
 * its length. Nothing else on the timeline notices.
 */
export function slipClip(timeline: Timeline, clipId: string, deltaSec: number): Timeline {
  const found = findClip(timeline, clipId);
  if (!found || !isMediaClip(found.clip) || found.clip.source.kind !== "video") return timeline;
  const track = trackOf(timeline, clipId);
  if (!track) return timeline;

  const clips = track.clips.map((clip) => {
    if (clip.id !== clipId || !isMediaClip(clip)) return clip;
    return { ...clip, sourceInSec: round3(Math.max(0, (clip.sourceInSec ?? 0) + deltaSec)) };
  });
  return withTrack(timeline, track.id, clips);
}

/**
 * Slide a clip along the track: it keeps its content and length, while the neighbour
 * before it and the neighbour after it absorb the move.
 */
export function slideClip(timeline: Timeline, clipId: string, deltaSec: number): Timeline {
  const track = trackOf(timeline, clipId);
  const found = findClip(timeline, clipId);
  if (!track || !found) return timeline;

  const clips = ordered(track);
  const index = clips.findIndex((clip) => clip.id === clipId);
  const previous = index > 0 ? clips[index - 1] : undefined;
  const next = clips[index + 1];
  if (!previous || !next) return timeline;

  const minimum = 0.001;
  const delta = round3(Math.max(minimum - previous.durationSec, Math.min(next.durationSec - minimum, deltaSec)));
  if (delta === 0) return timeline;

  return withTrack(timeline, track.id, clips.map((clip) => {
    if (clip.id === previous.id) return { ...clip, durationSec: round3(clip.durationSec + delta) };
    if (clip.id === clipId) return shifted(clip, delta);
    if (clip.id !== next.id) return clip;
    const moved: Clip = { ...clip, startSec: round3(clip.startSec + delta), durationSec: round3(clip.durationSec - delta) };
    if (isMediaClip(clip) && clip.source.kind === "video" && isMediaClip(moved)) {
      moved.sourceInSec = round3(Math.max(0, (clip.sourceInSec ?? 0) + delta));
    }
    return moved;
  }));
}

/**
 * J-cut: the incoming audio starts before its picture. The ear arrives in the new scene
 * first, which is what makes a cut feel motivated rather than abrupt.
 */
export function jCut(timeline: Timeline, audioClipId: string, leadSec: number): Timeline {
  const found = findClip(timeline, audioClipId);
  const track = trackOf(timeline, audioClipId);
  if (!found || !track || leadSec <= 0) return timeline;

  const lead = round3(Math.min(leadSec, found.clip.startSec));
  if (lead <= 0) return timeline;
  const clips = track.clips.map((clip) =>
    clip.id === audioClipId
      ? { ...clip, startSec: round3(clip.startSec - lead), durationSec: round3(clip.durationSec + lead) }
      : clip,
  );
  return withTrack(timeline, track.id, clips);
}

/** L-cut: the outgoing audio runs on under the next shot's picture. */
export function lCut(timeline: Timeline, audioClipId: string, tailSec: number): Timeline {
  const found = findClip(timeline, audioClipId);
  const track = trackOf(timeline, audioClipId);
  if (!found || !track || tailSec <= 0) return timeline;

  const clips = track.clips.map((clip) =>
    clip.id === audioClipId ? { ...clip, durationSec: round3(clip.durationSec + tailSec) } : clip,
  );
  return withTrack(timeline, track.id, clips);
}

/** Butt every clip on a track up against the previous one, removing gaps and overlaps. */
export function closeGaps(timeline: Timeline, trackId: string): Timeline {
  const track = timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return timeline;

  let cursor = 0;
  const clips = ordered(track).map((clip) => {
    const placed = { ...clip, startSec: round3(cursor) };
    cursor = round3(cursor + clip.durationSec);
    return placed;
  });
  return withTrack(timeline, track.id, clips);
}

/** Gaps on a track, as [start, end] pairs. Useful for QA before a render. */
export function findGaps(timeline: Timeline, trackId: string): { startSec: number; endSec: number }[] {
  const track = timeline.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return [];

  const gaps: { startSec: number; endSec: number }[] = [];
  let cursor = 0;
  for (const clip of ordered(track)) {
    if (clip.startSec > cursor + 0.002) gaps.push({ startSec: round3(cursor), endSec: round3(clip.startSec) });
    cursor = Math.max(cursor, clipEnd(clip));
  }
  return gaps;
}

/**
 * Crossfade two adjacent clips by overlapping them: the second clip starts early and both
 * carry matching transition metadata for the renderer.
 */
export function crossfade(timeline: Timeline, leftId: string, rightId: string, durationSec: number): Timeline {
  const track = trackOf(timeline, leftId);
  const left = findClip(timeline, leftId)?.clip;
  const right = findClip(timeline, rightId)?.clip;
  if (!track || !left || !right || durationSec <= 0) return timeline;
  if (trackOf(timeline, rightId)?.id !== track.id) return timeline;

  const overlap = round3(Math.min(durationSec, left.durationSec * 0.5, right.durationSec * 0.5));
  if (overlap <= 0) return timeline;

  const clips = ordered(track).map((clip) => {
    if (clip.id === leftId) return { ...clip, transitionOut: { kind: "crossfade" as const, durationSec: overlap } };
    if (clip.id === rightId) {
      return {
        ...clip,
        startSec: round3(Math.max(0, clip.startSec - overlap)),
        transitionIn: { kind: "crossfade" as const, durationSec: overlap },
      };
    }
    return clip.startSec > right.startSec ? shifted(clip, -overlap) : clip;
  });
  return withTrack(timeline, track.id, clips);
}
