// Final Cut Pro FCPXML — a rough-cut handoff Final Cut (and Premiere, via import) can open.
// Media clips become <asset-clip>s; generated/text clips become <gap>s with a <title>. Timing uses
// FCP's rational "{frames}/{fps}s" form. Faithful to the cut, not to per-clip effects.

import type { Clip, Timeline } from "../../core/src/index";
import { isMediaClip, type MediaClip } from "../../core/src/index";
import { secondsToFrameCount } from "./timecode";
import type { ExportOptions } from "./index";

const xmlEscape = (s: string): string => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const rat = (sec: number, fps: number): string => `${secondsToFrameCount(sec, fps)}/${fps}s`;

/** Export the IR to FCPXML 1.10 (a rough cut: clips placed on the primary storyline). */
export function timelineToFCPXML(timeline: Timeline, opts: ExportOptions = {}): string {
  const { width, height, fps, durationSec } = timeline.composition;
  const clips = timeline.tracks.filter((t) => t.type === "video").flatMap((t) => t.clips).sort((a, b) => a.startSec - b.startSec);

  // unique media assets
  const assets = new Map<string, { id: string; name: string }>();
  let assetN = 2;
  for (const c of clips) if (isMediaClip(c)) {
    const path = (c as MediaClip).source.path;
    if (!assets.has(path)) assets.set(path, { id: `r${assetN++}`, name: path.split(/[\\/]/).pop() || "clip" });
  }

  const resources: string[] = [
    `    <format id="r1" name="FFVideoFormat${height}p${Math.round(fps)}" frameDuration="1/${Math.round(fps)}s" width="${width}" height="${height}"/>`,
  ];
  for (const [path, a] of assets) {
    resources.push(`    <asset id="${a.id}" name="${xmlEscape(a.name)}" src="file://${xmlEscape(path.replace(/\\/g, "/"))}" hasVideo="1" format="r1"/>`);
  }

  const spine: string[] = [];
  for (const c of clips) {
    const offset = rat(c.startSec, fps), dur = rat(c.durationSec, fps);
    if (isMediaClip(c)) {
      const a = assets.get((c as MediaClip).source.path)!;
      const srcStart = rat((c as MediaClip).sourceInSec ?? 0, fps);
      spine.push(`        <asset-clip ref="${a.id}" offset="${offset}" duration="${dur}" start="${srcStart}" name="${xmlEscape(a.name)}"/>`);
    } else if (c.type === "text") {
      spine.push(`        <gap offset="${offset}" duration="${dur}"><title name="${xmlEscape((c as { text: string }).text.slice(0, 40))}" offset="0s" duration="${dur}"/></gap>`);
    } else {
      spine.push(`        <gap offset="${offset}" duration="${dur}" name="${xmlEscape((c as { label?: string }).label || c.id)}"/>`);
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    `<fcpxml version="1.10">`,
    `  <resources>`,
    ...resources,
    `  </resources>`,
    `  <library>`,
    `    <event name="${xmlEscape(opts.title || "Montara")}">`,
    `      <project name="${xmlEscape(opts.title || "Montara Edit")}">`,
    `        <sequence format="r1" duration="${rat(durationSec, fps)}" tcStart="0s" tcFormat="NDF">`,
    `      <spine>`,
    ...spine,
    `      </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`,
    "",
  ].join("\n");
}
