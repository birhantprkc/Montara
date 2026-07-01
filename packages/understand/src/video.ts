// @montara/understand — video understanding (§G).
// Real per-frame analysis with ffmpeg signalstats (brightness + colorfulness) at scene cuts, rolled
// up into tags and a caption. Optional Transformers.js CLIP/BLIP-style vision can enrich the same
// descriptor shape without making model downloads part of the default local path.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { sampleKeyFrames } from "./frames";
import { detectScenes } from "./scenes";
import { probeMediaInfo } from "./probe";
import {
  analyzeFramesWithVisionModels,
  visionModelStatus,
  type VisionMode,
  type VisionModelAnalysis,
  type VisionModelStatus,
} from "./vision";

export interface FrameDescriptor {
  atSec: number;
  /** 0..1 mean luma */
  brightness: number;
  /** 0..1 chroma spread */
  colorfulness: number;
}

export type ReferenceMotionType = "motion_clip" | "animated_still" | "static_image";

export interface VideoAspectBreakdown {
  shotId: string;
  startSec: number;
  endSec: number;
  subject: string;
  subjectMotion: string;
  scene: string;
  spatialFraming: string;
  camera: string;
  motionType: ReferenceMotionType;
  flowVariance: number;
  visualTags: string[];
}

export interface VideoUnderstanding {
  mode: "signalstats" | "vision-models";
  durationSec: number;
  sceneCount: number;
  frames: FrameDescriptor[];
  tags: string[];
  caption: string;
  aspectBreakdown: VideoAspectBreakdown[];
  vision?: VisionModelAnalysis;
  visionStatus?: VisionModelStatus;
}

export interface UnderstandVisionOptions {
  maxFrames?: number;
  vision?: VisionMode;
  env?: Record<string, string | undefined>;
  labels?: string[];
  clipModel?: string;
  captionModel?: string;
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

function visualTone(frame: FrameDescriptor | undefined): string[] {
  if (!frame) return ["unknown-light", "unknown-color"];
  return [
    frame.brightness < 0.3 ? "dark" : frame.brightness > 0.6 ? "bright" : "mid-key",
    frame.colorfulness > 0.2 ? "colorful" : "muted",
  ];
}

function closestFrame(frames: FrameDescriptor[], atSec: number): FrameDescriptor | undefined {
  return frames
    .slice()
    .sort((a, b) => Math.abs(a.atSec - atSec) - Math.abs(b.atSec - atSec))[0];
}

function flowVariance(frames: FrameDescriptor[], startSec: number, endSec: number): number {
  const inside = frames.filter((frame) => frame.atSec >= startSec && frame.atSec <= endSec);
  const sample = inside.length >= 2 ? inside : frames.slice(0, 2);
  if (sample.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < sample.length; i++) {
    total += Math.abs(sample[i]!.brightness - sample[i - 1]!.brightness);
    total += Math.abs(sample[i]!.colorfulness - sample[i - 1]!.colorfulness);
  }
  return Math.round((total / (sample.length - 1)) * 1000) / 1000;
}

function motionTypeFor(variance: number, shotDurationSec: number, sceneCount: number): ReferenceMotionType {
  if (sceneCount <= 1 && variance < 0.025 && shotDurationSec > 1) return "static_image";
  if (variance < 0.08) return "animated_still";
  return "motion_clip";
}

function aspectBreakdown(
  durationSec: number,
  width: number,
  height: number,
  hasAudio: boolean,
  cuts: number[],
  frames: FrameDescriptor[],
): VideoAspectBreakdown[] {
  const boundaries = [0, ...cuts.filter((cut) => cut > 0 && cut < durationSec), durationSec].sort((a, b) => a - b);
  const ranges = boundaries.slice(0, -1).map((start, index) => ({
    startSec: Math.round(start * 1000) / 1000,
    endSec: Math.round(Math.max(start + 0.001, boundaries[index + 1] ?? durationSec) * 1000) / 1000,
  }));
  const usableRanges = ranges.length ? ranges : [{ startSec: 0, endSec: Math.max(0.001, durationSec) }];
  return usableRanges.slice(0, Math.max(1, Math.min(8, usableRanges.length))).map((range, index) => {
    const mid = (range.startSec + range.endSec) / 2;
    const frame = closestFrame(frames, mid);
    const tags = visualTone(frame);
    const variance = flowVariance(frames, range.startSec, range.endSec);
    const shotDurationSec = Math.max(0.001, range.endSec - range.startSec);
    const aspect = width >= height ? "landscape" : "vertical";
    const motionType = motionTypeFor(variance, shotDurationSec, usableRanges.length);
    return {
      shotId: `shot-${index + 1}`,
      startSec: range.startSec,
      endSec: range.endSec,
      subject: hasAudio && usableRanges.length <= 2 ? "speech-led source subject" : "primary visible source subject",
      subjectMotion: motionType === "motion_clip" ? "visible motion or edit change" : "limited frame-to-frame motion",
      scene: `${tags[0]}, ${tags[1]} ${aspect} shot`,
      spatialFraming: aspect === "vertical" ? "vertical social framing" : "landscape / horizontal framing",
      camera: usableRanges.length >= 4 ? "cut-driven camera or edit rhythm" : "held or slowly changing camera",
      motionType,
      flowVariance: variance,
      visualTags: tags,
    };
  });
}

export function understandVideo(inputPath: string, opts: { maxFrames?: number } = {}): VideoUnderstanding {
  const { durationSec, width, height, hasAudio } = probeMediaInfo(inputPath);
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
  tags.push(width >= height ? "horizontal" : "vertical");
  tags.push(hasAudio ? "speech-capable" : "silent");

  const breakdown = aspectBreakdown(durationSec, width, height, hasAudio, scenes.cuts, frames);
  const motionSummary = new Set(breakdown.map((shot) => shot.motionType));
  for (const motion of motionSummary) tags.push(motion);

  const caption = `A ${tags[0]}, ${tags[1]} ${width >= height ? "horizontal" : "vertical"} clip with ${scenes.sceneCount} scene(s).`;
  return { mode: "signalstats", durationSec, sceneCount: scenes.sceneCount, frames, tags, caption, aspectBreakdown: breakdown };
}

function mergeTags(base: string[], semantic: string[]): string[] {
  const merged: string[] = [];
  for (const tag of [...semantic, ...base]) {
    const clean = tag.trim();
    if (clean && !merged.includes(clean)) merged.push(clean);
  }
  return merged.slice(0, 12);
}

export async function understandVideoWithVision(
  inputPath: string,
  opts: UnderstandVisionOptions = {},
): Promise<VideoUnderstanding> {
  const base = understandVideo(inputPath, { maxFrames: opts.maxFrames });
  const vision = opts.vision ?? "auto";
  const visionOptions = {
    mode: vision,
    env: opts.env,
    labels: opts.labels,
    clipModel: opts.clipModel,
    captionModel: opts.captionModel,
  };
  const status = visionModelStatus(visionOptions);

  if (!status.available || !status.enabled) {
    if (vision === "require") {
      throw new Error(status.reason ?? "vision models unavailable");
    }
    return { ...base, visionStatus: status };
  }

  const framesDir = join(tmpdir(), `montara-vision-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`);
  try {
    const sampled = sampleKeyFrames(inputPath, framesDir, { maxFrames: opts.maxFrames ?? 4 });
    const analysis = await analyzeFramesWithVisionModels(sampled.map((frame) => frame.path), visionOptions);
    const tags = mergeTags(base.tags, analysis.tags);
    const caption = analysis.caption ? `${analysis.caption} ${base.caption}` : base.caption;
    return {
      ...base,
      mode: analysis.frameAnalyses.length ? "vision-models" : "signalstats",
      tags,
      caption,
      vision: analysis,
      visionStatus: analysis.status,
    };
  } finally {
    rmSync(framesDir, { recursive: true, force: true });
  }
}
