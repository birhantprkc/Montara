// @montara/bridge — pro-editor handoff. Export the Montara Timeline IR to the interchange formats
// the big NLEs import: CMX3600 EDL, Final Cut FCPXML, and OpenTimelineIO (DaVinci / Premiere via
// OTIO). This is how "edit in Montara, finish in Premiere/DaVinci/Final Cut" works — the IR is the
// single source of truth, these are lossy-but-faithful round-trip-out views of it.

import type { Clip, MediaClip, Timeline } from "../../core/src/index";
import { isMediaClip } from "../../core/src/index";

export * from "./timecode";
export { timelineToEDL } from "./edl";
export { timelineToFCPXML } from "./fcpxml";
export { timelineToOTIO } from "./otio";

import { timelineToEDL } from "./edl";
import { timelineToFCPXML } from "./fcpxml";
import { timelineToOTIO } from "./otio";

export type EditorFormat = "edl" | "fcpxml" | "otio";

/** All video-track clips across the timeline, sorted by start time. */
export function videoClips(timeline: Timeline): Clip[] {
  return timeline.tracks
    .filter((t) => t.type === "video")
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startSec - b.startSec);
}

/** A human/editor-facing label for a clip (basename for media, else label/text). */
export function clipLabel(clip: Clip): string {
  if (isMediaClip(clip)) {
    const path = (clip as MediaClip).source.path;
    return path.split(/[\\/]/).pop() || clip.id;
  }
  if (clip.type === "text") return (clip as { text: string }).text.slice(0, 40) || clip.id;
  return (clip as { label?: string }).label || clip.id;
}

export interface ExportOptions { title?: string; fileExtension?: string }

/** Export the IR to the requested NLE format; returns the file contents + a suggested extension. */
export function exportTimeline(timeline: Timeline, format: EditorFormat, opts: ExportOptions = {}): { content: string; ext: string } {
  switch (format) {
    case "edl": return { content: timelineToEDL(timeline, opts), ext: "edl" };
    case "fcpxml": return { content: timelineToFCPXML(timeline, opts), ext: "fcpxml" };
    case "otio": return { content: timelineToOTIO(timeline, opts), ext: "otio" };
  }
}
