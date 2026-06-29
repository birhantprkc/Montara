// @montara/render-ffmpeg — publish-stage craft helpers: thumbnails and Shorts.
// Distinct thumbnail hooks (not the title repeated) and vertical 9:16 cut-downs are part of the
// craft layer's "worth watching / worth clicking" gate. All real ffmpeg, no placeholders.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { mediaBin } from "./ffmpegPath";
import { drawtextFont } from "./font";

function run(bin: string, args: string[]): boolean {
  return (spawnSync(bin, args, { encoding: "utf8" }).status ?? -1) === 0;
}
const esc = (s: string): string => s.replace(/[\\:']/g, " ").replace(/%/g, "\\%").trim();

export interface ThumbConcept {
  /** Short hook text (NOT the video title). */
  hook: string;
  /** Accent hex without '#'. */
  accent?: string;
  /** Source timestamp to grab the background frame from (seconds). */
  atSec?: number;
}

/** Generate N genuinely distinct thumbnail concepts (different frame + different hook + accent). */
export function generateThumbnails(video: string, outDir: string, concepts: ThumbConcept[]): string[] {
  mkdirSync(outDir, { recursive: true });
  const ff = mediaBin("ffmpeg");
  const out: string[] = [];
  concepts.forEach((c, i) => {
    const p = join(outDir, `thumb-${i + 1}.png`);
    const accent = (c.accent ?? "ffffff").replace(/^#/, "");
    const hook = esc(c.hook).slice(0, 48);
    const vf = [
      `scale=1280:720:force_original_aspect_ratio=increase`,
      `crop=1280:720`,
      `eq=contrast=1.08:saturation=1.12`,
      `drawbox=x=0:y=560:w=1280:h=160:color=black@0.55:t=fill`,
      `drawbox=x=0:y=556:w=1280:h=6:color=0x${accent}:t=fill`,
      `drawtext=${drawtextFont()}:text='${hook}':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=600:shadowcolor=black:shadowx=3:shadowy=3`,
    ].join(",");
    if (run(ff, ["-y", "-ss", String(c.atSec ?? 1), "-i", video, "-frames:v", "1", "-vf", vf, p])) out.push(p);
  });
  return out;
}

export interface ShortCut {
  startSec: number;
  endSec: number;
  /** Optional caption burned at the lower third. */
  caption?: string;
  captionAccent?: string;
}

/** Cut a vertical 9:16 Short from a landscape source (center-crop + optional caption). */
export function cutShort(video: string, cut: ShortCut, outPath: string): boolean {
  mkdirSync(dirname(outPath), { recursive: true });
  const ff = mediaBin("ffmpeg");
  const dur = Math.max(0.5, cut.endSec - cut.startSec);
  const filters = ["scale=-2:1920", "crop=1080:1920"];
  if (cut.caption) {
    const accent = (cut.captionAccent ?? "ffffff").replace(/^#/, "");
    filters.push(
      `drawbox=x=0:y=1500:w=1080:h=240:color=black@0.5:t=fill`,
      `drawtext=${drawtextFont()}:text='${esc(cut.caption).slice(0, 80)}':fontcolor=0x${accent}:fontsize=52:x=(w-text_w)/2:y=1560:line_spacing=10:shadowcolor=black:shadowx=2:shadowy=2`,
    );
  }
  return run(ff, [
    "-y", "-ss", String(cut.startSec), "-t", String(dur), "-i", video,
    "-vf", filters.join(","),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    outPath,
  ]);
}

/** Cut multiple Shorts; returns the paths that rendered. */
export function cutShorts(video: string, cuts: ShortCut[], outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];
  cuts.forEach((c, i) => {
    const p = join(outDir, `short-${i + 1}.mp4`);
    if (cutShort(video, c, p)) paths.push(p);
  });
  return paths;
}
