// CMX3600 EDL — the lingua franca every NLE and color tool reads.

import type { Timeline } from "../../core/src/index";
import { isMediaClip, type MediaClip } from "../../core/src/index";
import { secondsToTimecode } from "./timecode";
import type { ExportOptions } from "./index";

function label(clip: { id: string; type: string }): string {
  const c = clip as MediaClip & { label?: string; text?: string };
  if (isMediaClip(clip as never)) return (c.source.path.split(/[\\/]/).pop() || c.id);
  if (clip.type === "text") return (c.text || c.id).slice(0, 40);
  return c.label || clip.id;
}

/** Emit a CMX3600 EDL of the video track (one cut event per clip). */
export function timelineToEDL(timeline: Timeline, opts: ExportOptions = {}): string {
  const fps = timeline.composition.fps;
  const clips = timeline.tracks
    .filter((t) => t.type === "video")
    .flatMap((t) => t.clips)
    .sort((a, b) => a.startSec - b.startSec);

  const lines: string[] = [`TITLE: ${(opts.title || "MONTARA EDIT").toUpperCase()}`, "FCM: NON-DROP FRAME", ""];
  clips.forEach((clip, i) => {
    const ev = String(i + 1).padStart(3, "0");
    const inSrc = isMediaClip(clip) ? (clip.sourceInSec ?? 0) : 0;
    const srcIn = secondsToTimecode(inSrc, fps);
    const srcOut = secondsToTimecode(inSrc + clip.durationSec, fps);
    const recIn = secondsToTimecode(clip.startSec, fps);
    const recOut = secondsToTimecode(clip.startSec + clip.durationSec, fps);
    const reel = isMediaClip(clip) ? "AX" : "BL"; // AX = aux source, BL = black/generated
    lines.push(`${ev}  ${reel.padEnd(8)} V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    lines.push(`* FROM CLIP NAME: ${label(clip)}`);
    lines.push("");
  });
  return lines.join("\n");
}
