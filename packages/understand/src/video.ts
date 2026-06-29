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
  durationSec: number;
  sceneCount: number;
  frames: FrameDescriptor[];
  tags: string[];
  caption: string;
  aspectBreakdown: VideoAspectBreakdown[];
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
  return { durationSec, sceneCount: scenes.sceneCount, frames, tags, caption, aspectBreakdown: breakdown };
}
