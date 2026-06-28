// OpenTimelineIO (.otio JSON) — the modern interchange DaVinci Resolve and Premiere read via OTIO.
// OTIO tracks are sequential, so gaps fill the time between clips' absolute starts.

import type { Clip, Timeline, Track } from "../../core/src/index";
import { isMediaClip } from "../../core/src/index";
import { secondsToFrameCount } from "./timecode";
import type { ExportOptions } from "./index";

function rationalTime(sec: number, fps: number): unknown {
  return { OTIO_SCHEMA: "RationalTime.1", rate: fps, value: secondsToFrameCount(sec, fps) };
}
function timeRange(startSec: number, durSec: number, fps: number): unknown {
  return { OTIO_SCHEMA: "TimeRange.1", start_time: rationalTime(startSec, fps), duration: rationalTime(durSec, fps) };
}

function otioClip(clip: Clip, fps: number): unknown {
  const name = isMediaClip(clip) ? (clip.source.path.split(/[\\/]/).pop() || clip.id) : ((clip as { label?: string; text?: string }).label ?? (clip as { text?: string }).text ?? clip.id);
  const mediaRef = isMediaClip(clip)
    ? { OTIO_SCHEMA: "ExternalReference.1", target_url: clip.source.path }
    : { OTIO_SCHEMA: "MissingReference.1", name };
  const inSec = isMediaClip(clip) ? (clip.sourceInSec ?? 0) : 0;
  return {
    OTIO_SCHEMA: "Clip.1",
    name,
    source_range: timeRange(inSec, clip.durationSec, fps),
    media_reference: mediaRef,
  };
}

function otioTrack(track: Track, fps: number, kind: "Video" | "Audio"): unknown {
  const sorted = [...track.clips].sort((a, b) => a.startSec - b.startSec);
  const children: unknown[] = [];
  let cursor = 0;
  for (const clip of sorted) {
    if (clip.startSec > cursor + 1e-6) {
      children.push({ OTIO_SCHEMA: "Gap.1", name: "gap", source_range: timeRange(0, clip.startSec - cursor, fps) });
    }
    children.push(otioClip(clip, fps));
    cursor = clip.startSec + clip.durationSec;
  }
  return { OTIO_SCHEMA: "Track.1", name: track.id, kind, children };
}

/** Export the IR to an OpenTimelineIO JSON document. */
export function timelineToOTIO(timeline: Timeline, opts: ExportOptions = {}): string {
  const fps = timeline.composition.fps;
  const tracks = timeline.tracks
    .filter((t) => t.type === "video" || t.type === "audio")
    .map((t) => otioTrack(t, fps, t.type === "audio" ? "Audio" : "Video"));
  const doc = {
    OTIO_SCHEMA: "Timeline.1",
    name: opts.title || "Montara Edit",
    global_start_time: rationalTime(0, fps),
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: tracks },
  };
  return JSON.stringify(doc, null, 2);
}
