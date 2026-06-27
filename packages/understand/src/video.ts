// @montara/understand — video understanding (§G).
// Real per-frame analysis with ffmpeg signalstats (brightness + colorfulness) at scene cuts, rolled
// up into tags and a caption. A CLIP/BLIP captioner plugs in later behind the same descriptor shape.

import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { detectScenes } from "./scenes";
import { probeMediaInfo } from "./probe";

export interface FrameDescriptor {
  atSec: number;
  /** 0..1 mean luma */
  brightness: number;
  /** 0..1 chroma spread */
  colorfulness: number;
}

export interface VideoUnderstanding {
  durationSec: number;
  sceneCount: number;
  frames: FrameDescriptor[];
  tags: string[];
  caption: string;
}

function frameStats(inputPath: string, atSec: number): { brightness: number; colorfulness: number } {
  const r = spawnSync(mediaBin("ffmpeg"), [
    "-hide_banner",
    "-ss", atSec.toFixed(3),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "signalstats,metadata=print",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const t = r.stderr || "";
  const y = /signalstats\.YAVG=([0-9.]+)/.exec(t);
  const u = /signalstats\.UAVG=([0-9.]+)/.exec(t);
  const v = /signalstats\.VAVG=([0-9.]+)/.exec(t);
  const brightness = y ? Number(y[1] ?? "0") / 255 : 0;
  const ud = u ? Math.abs(Number(u[1] ?? "128") - 128) : 0;
  const vd = v ? Math.abs(Number(v[1] ?? "128") - 128) : 0;
  const colorfulness = Math.min(1, (ud + vd) / 128);
  return { brightness: Math.round(brightness * 1000) / 1000, colorfulness: Math.round(colorfulness * 1000) / 1000 };
}

export function understandVideo(inputPath: string, opts: { maxFrames?: number } = {}): VideoUnderstanding {
  const { durationSec } = probeMediaInfo(inputPath);
  const scenes = detectScenes(inputPath);
  const max = Math.max(2, opts.maxFrames ?? 4);
  const times = scenes.cuts.length
    ? [0, ...scenes.cuts].slice(0, max)
    : Array.from({ length: max }, (_, i) => (durationSec * (i + 0.5)) / max);

  const frames = times.map((t) => ({ atSec: Math.round(t * 1000) / 1000, ...frameStats(inputPath, t) }));
  const avgBrightness = frames.reduce((s, f) => s + f.brightness, 0) / Math.max(1, frames.length);
  const avgColor = frames.reduce((s, f) => s + f.colorfulness, 0) / Math.max(1, frames.length);

  const tags: string[] = [];
  tags.push(avgBrightness < 0.3 ? "dark" : avgBrightness > 0.6 ? "bright" : "mid-key");
  tags.push(avgColor > 0.2 ? "colorful" : "muted");
  tags.push(scenes.sceneCount >= 4 ? "fast-cut" : "slow-cut");

  const caption = `A ${tags[0]}, ${tags[1]} clip with ${scenes.sceneCount} scene(s).`;
  return { durationSec, sceneCount: scenes.sceneCount, frames, tags, caption };
}
