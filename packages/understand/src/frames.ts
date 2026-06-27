// @montara/understand — intelligent frame sampler (§G).
// Samples frames at detected scene cuts (falling back to even sampling), writing real PNGs.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { detectScenes } from "./scenes";
import { probeMediaInfo } from "./probe";

export interface SampledFrame {
  atSec: number;
  path: string;
}

export function sampleKeyFrames(inputPath: string, outDir: string, opts: { maxFrames?: number } = {}): SampledFrame[] {
  mkdirSync(outDir, { recursive: true });
  const max = Math.max(1, opts.maxFrames ?? 6);
  const { durationSec } = probeMediaInfo(inputPath);
  const scenes = detectScenes(inputPath);

  let times = scenes.cuts.length ? [0, ...scenes.cuts] : [];
  if (times.length < 2) {
    const n = Math.min(max, 4);
    times = Array.from({ length: n }, (_, i) => (durationSec * (i + 0.5)) / n);
  }
  times = times.slice(0, max);

  const frames: SampledFrame[] = [];
  times.forEach((t, i) => {
    const p = join(outDir, `frame-${i}.png`);
    spawnSync(mediaBin("ffmpeg"), ["-y", "-ss", t.toFixed(3), "-i", inputPath, "-frames:v", "1", p], { encoding: "utf8" });
    if (existsSync(p)) frames.push({ atSec: Math.round(t * 1000) / 1000, path: p });
  });
  return frames;
}
