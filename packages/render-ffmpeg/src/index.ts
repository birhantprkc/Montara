// @montara/render-ffmpeg - universal assembly/fallback layer.
// Compiles a ScenePlan into a real MP4: each scene = a solid-color clip (with an optional
// centered title) + silent audio, then concat-demuxed into one file. Deliberately robust:
// it is the fallback every other composer/adapter degrades to.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ScenePlan, Timeline } from "../../core/src/index";
import { timelineToScenePlan, validateTimeline } from "../../core/src/index";
import { mediaBin } from "./ffmpegPath";
import { drawtextFont } from "./font";

export { mediaBin };
export { drawtextFont, resolveFontFile, type DrawtextFontOptions } from "./font";
export { compositeTimeline } from "./composite";
export { masterAudio, measureLoudness, type LoudnessStats, type MasterOptions, type MasterResult } from "./master";
export { generateThumbnails, cutShort, cutShorts, type ThumbConcept, type ShortCut } from "./craft";
export { buildReel, type Caption, type ReelBeat, type ReelOptions, type ReelResult, type ReelTimingOptions, type ReelVisualStyle } from "./reel";

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || "").slice(-800);
    throw new Error(`${bin} failed (exit ${r.status}): ${tail}`);
  }
}

/** Render a ScenePlan to `outPath` (real MP4). Returns the path. */
export function renderScenePlan(plan: ScenePlan, outPath: string): string {
  if (!plan.scenes.length) throw new Error("scene plan has no scenes");
  mkdirSync(dirname(outPath), { recursive: true });
  const ff = mediaBin("ffmpeg");
  const work = join(tmpdir(), `montara-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });

  const segs: string[] = [];
  plan.scenes.forEach((sc, i) => {
    const seg = join(work, `seg-${i}.mp4`);
    const dur = Math.max(0.2, sc.durationSec).toFixed(2);
    const bg = (sc.background || "0a0a0a").replace(/^#/, "");
    const title = (sc.title || "").replace(/[':\\]/g, " ").trim().slice(0, 60);
    const vf = title
      ? `drawtext=${drawtextFont()}:text='${title}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2`
      : "null";
    run(ff, [
      "-y",
      "-f", "lavfi", "-i", `color=c=0x${bg}:s=${plan.width}x${plan.height}:d=${dur}:r=${plan.fps}`,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-vf", vf,
      "-t", dur, "-r", String(plan.fps),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-crf", "28",
      "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest",
      seg,
    ]);
    segs.push(seg);
  });

  const listFile = join(work, "concat.txt");
  writeFileSync(listFile, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  run(ff, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath]);

  try { rmSync(work, { recursive: true, force: true }); } catch { /* temp cleanup best-effort */ }
  return outPath;
}

/** Render the Timeline IR through the ffmpeg fallback composer. */
export function renderTimeline(timeline: Timeline, outPath: string): string {
  const issues = validateTimeline(timeline);
  if (issues.length) throw new Error(`invalid timeline: ${issues.join("; ")}`);
  return renderScenePlan(timelineToScenePlan(timeline), outPath);
}

/** Media duration in seconds via ffprobe (0 if it can't be read). */
export function probeDuration(path: string): number {
  const r = spawnSync(mediaBin("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
  return parseFloat((r.stdout || "0").trim()) || 0;
}
