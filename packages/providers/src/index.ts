// @montara/providers - Phase 1.3 tool/provider contracts.
// This seed layer is intentionally local/free: every tool works offline through Timeline IR
// and ffmpeg, giving later cloud/local-runtime adapters a stable shape to plug into.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Timeline } from "../../core/src/index";
import { normalizeHex, timelineToScenePlan } from "../../core/src/index";
import { mediaBin, renderScenePlan } from "../../render-ffmpeg/src/index";

export type ToolCategory = "video" | "image" | "tts" | "music" | "post" | "analysis";
export type ToolTier = "local-free" | "local-runtime" | "cloud";

export interface ProviderToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  tier: ToolTier;
  capability: string;
  description: string;
}

export interface ToolArtifact {
  kind: "image" | "video" | "audio" | "subtitle" | "json";
  path: string;
}

export interface ToolRunResult {
  toolId: string;
  artifacts: ToolArtifact[];
  metadata: Record<string, string | number | boolean>;
}

export interface CaptionCardImageInput {
  title: string;
  outPath: string;
  width?: number;
  height?: number;
  background?: string;
}

export interface CaptionCardVideoInput extends CaptionCardImageInput {
  durationSec?: number;
  fps?: number;
}

export interface SilentVoiceInput {
  text: string;
  outPath: string;
  durationSec?: number;
}

export interface ToneMusicInput {
  outPath: string;
  durationSec?: number;
  frequencyHz?: number;
}

export interface SubtitleInput {
  timeline: Timeline;
  srtPath: string;
  vttPath?: string;
}

export interface TrimInput {
  inputPath: string;
  outPath: string;
  startSec: number;
  durationSec: number;
}

export interface StitchInput {
  inputPaths: string[];
  outPath: string;
}

export interface ProbeInput {
  inputPath: string;
}

export interface FrameSampleInput {
  inputPath: string;
  outPath: string;
  atSec?: number;
}

export type ProviderToolInput =
  | CaptionCardImageInput
  | CaptionCardVideoInput
  | SilentVoiceInput
  | ToneMusicInput
  | SubtitleInput
  | TrimInput
  | StitchInput
  | ProbeInput
  | FrameSampleInput;

export const PROVIDER_TOOLS: ProviderToolDefinition[] = [
  {
    id: "local.caption-card-image",
    name: "Caption Card Image",
    category: "image",
    tier: "local-free",
    capability: "image-fallback",
    description: "Offline image fallback: a designed solid card PNG for missing imagery.",
  },
  {
    id: "local.caption-card-video",
    name: "Caption Card Video",
    category: "video",
    tier: "local-free",
    capability: "video-fallback",
    description: "Offline video fallback: a titled scene-card MP4 through the Timeline IR path.",
  },
  {
    id: "local.silent-voice",
    name: "Silent Voice Bed",
    category: "tts",
    tier: "local-free",
    capability: "voice-fallback",
    description: "TTS fallback that preserves timing with a silent PCM voice placeholder.",
  },
  {
    id: "local.tone-score",
    name: "Tone Score",
    category: "music",
    tier: "local-free",
    capability: "music-bed",
    description: "Music fallback that emits a quiet generated tone bed for timing tests.",
  },
  {
    id: "local.timeline-subtitles",
    name: "Timeline Subtitles",
    category: "post",
    tier: "local-free",
    capability: "post-subtitles",
    description: "Exports Timeline text clips to SRT and WebVTT subtitle files.",
  },
  {
    id: "local.video-trim",
    name: "Video Trim",
    category: "post",
    tier: "local-free",
    capability: "post-trim",
    description: "Trims an MP4 segment locally with ffmpeg.",
  },
  {
    id: "local.video-stitch",
    name: "Video Stitch",
    category: "post",
    tier: "local-free",
    capability: "post-stitch",
    description: "Concatenates compatible MP4 clips locally with ffmpeg.",
  },
  {
    id: "local.media-probe",
    name: "Media Probe",
    category: "analysis",
    tier: "local-free",
    capability: "analysis-probe",
    description: "Reads duration and file presence with ffprobe.",
  },
  {
    id: "local.frame-sample",
    name: "Frame Sample",
    category: "analysis",
    tier: "local-free",
    capability: "analysis-frame",
    description: "Samples a frame PNG from a video at a requested timestamp.",
  },
];

export function listProviderTools(category?: ToolCategory): ProviderToolDefinition[] {
  return category ? PROVIDER_TOOLS.filter((tool) => tool.category === category) : PROVIDER_TOOLS;
}

export function getProviderTool(id: string): ProviderToolDefinition | undefined {
  return PROVIDER_TOOLS.find((tool) => tool.id === id);
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function run(bin: string, args: string[]): void {
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const tail = (result.stderr || result.error?.message || "").slice(-800);
    throw new Error(`${bin} failed (exit ${result.status}): ${tail}`);
  }
}

function num(value: number | undefined, fallback: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, value ?? fallback) : fallback;
}

function subtitleTime(sec: number, separator: "," | "."): string {
  const safe = Math.max(0, sec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad = (v: number, n = 2): string => String(v).padStart(n, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(ms, 3)}`;
}

function timelineSubtitleRows(timeline: Timeline): { startSec: number; endSec: number; text: string }[] {
  return timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.type === "text")
    .map((clip) => ({
      startSec: clip.startSec,
      endSec: clip.startSec + clip.durationSec,
      text: clip.text,
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

export function renderCaptionCardImage(input: CaptionCardImageInput): ToolRunResult {
  const width = Math.round(num(input.width, 1280, 16));
  const height = Math.round(num(input.height, 720, 16));
  const bg = normalizeHex(input.background, "101820");
  ensureParent(input.outPath);
  run(mediaBin("ffmpeg"), [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x${bg}:s=${width}x${height}:d=0.1:r=1`,
    "-frames:v", "1",
    input.outPath,
  ]);
  return {
    toolId: "local.caption-card-image",
    artifacts: [{ kind: "image", path: input.outPath }],
    metadata: { title: input.title, width, height, background: bg },
  };
}

export function renderCaptionCardVideo(input: CaptionCardVideoInput): ToolRunResult {
  const durationSec = num(input.durationSec, 1.2, 0.2);
  const width = Math.round(num(input.width, 1280, 16));
  const height = Math.round(num(input.height, 720, 16));
  const fps = Math.round(num(input.fps, 30, 1));
  const background = normalizeHex(input.background, "101820");
  renderScenePlan({
    width,
    height,
    fps,
    scenes: [{ id: "caption-card", title: input.title, durationSec, background }],
  }, input.outPath);
  return {
    toolId: "local.caption-card-video",
    artifacts: [{ kind: "video", path: input.outPath }],
    metadata: { durationSec, width, height, fps, background },
  };
}

export function generateSilentVoice(input: SilentVoiceInput): ToolRunResult {
  const wordCount = input.text.trim() ? input.text.trim().split(/\s+/).length : 0;
  const durationSec = num(input.durationSec, Math.max(0.8, wordCount / 2.8), 0.2);
  ensureParent(input.outPath);
  run(mediaBin("ffmpeg"), [
    "-y",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
    "-t", durationSec.toFixed(3),
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);
  return {
    toolId: "local.silent-voice",
    artifacts: [{ kind: "audio", path: input.outPath }],
    metadata: { durationSec, wordCount },
  };
}

export function generateToneScore(input: ToneMusicInput): ToolRunResult {
  const durationSec = num(input.durationSec, 1.5, 0.2);
  const frequencyHz = Math.round(num(input.frequencyHz, 220, 40));
  ensureParent(input.outPath);
  run(mediaBin("ffmpeg"), [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=${frequencyHz}:sample_rate=48000:duration=${durationSec.toFixed(3)}`,
    "-af", "volume=0.08",
    "-c:a", "pcm_s16le",
    input.outPath,
  ]);
  return {
    toolId: "local.tone-score",
    artifacts: [{ kind: "audio", path: input.outPath }],
    metadata: { durationSec, frequencyHz },
  };
}

export function exportTimelineSubtitles(input: SubtitleInput): ToolRunResult {
  const rows = timelineSubtitleRows(input.timeline);
  ensureParent(input.srtPath);
  const srt = rows
    .map((row, index) => [
      String(index + 1),
      `${subtitleTime(row.startSec, ",")} --> ${subtitleTime(row.endSec, ",")}`,
      row.text,
      "",
    ].join("\n"))
    .join("\n");
  writeFileSync(input.srtPath, srt);

  const artifacts: ToolArtifact[] = [{ kind: "subtitle", path: input.srtPath }];
  if (input.vttPath) {
    ensureParent(input.vttPath);
    const vttRows = rows
      .map((row) => `${subtitleTime(row.startSec, ".")} --> ${subtitleTime(row.endSec, ".")}\n${row.text}\n`)
      .join("\n");
    writeFileSync(input.vttPath, `WEBVTT\n\n${vttRows}`);
    artifacts.push({ kind: "subtitle", path: input.vttPath });
  }

  return {
    toolId: "local.timeline-subtitles",
    artifacts,
    metadata: { cueCount: rows.length },
  };
}

export function trimVideo(input: TrimInput): ToolRunResult {
  ensureParent(input.outPath);
  run(mediaBin("ffmpeg"), [
    "-y",
    "-ss", Math.max(0, input.startSec).toFixed(3),
    "-i", input.inputPath,
    "-t", num(input.durationSec, 1, 0.2).toFixed(3),
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    input.outPath,
  ]);
  return {
    toolId: "local.video-trim",
    artifacts: [{ kind: "video", path: input.outPath }],
    metadata: { startSec: input.startSec, durationSec: input.durationSec },
  };
}

export function stitchVideos(input: StitchInput): ToolRunResult {
  if (input.inputPaths.length === 0) throw new Error("stitch requires at least one input path");
  ensureParent(input.outPath);
  const work = join(tmpdir(), `montara-stitch-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  const listFile = join(work, "concat.txt");
  writeFileSync(listFile, input.inputPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  run(mediaBin("ffmpeg"), ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", input.outPath]);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  return {
    toolId: "local.video-stitch",
    artifacts: [{ kind: "video", path: input.outPath }],
    metadata: { inputCount: input.inputPaths.length },
  };
}

export function probeMedia(input: ProbeInput): ToolRunResult {
  const exists = existsSync(input.inputPath);
  let durationSec = 0;
  if (exists) {
    const result = spawnSync(mediaBin("ffprobe"), [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      input.inputPath,
    ], { encoding: "utf8" });
    durationSec = parseFloat((result.stdout || "0").trim()) || 0;
  }
  return {
    toolId: "local.media-probe",
    artifacts: [],
    metadata: { exists, durationSec, inputPath: input.inputPath },
  };
}

export function sampleFrame(input: FrameSampleInput): ToolRunResult {
  ensureParent(input.outPath);
  run(mediaBin("ffmpeg"), [
    "-y",
    "-ss", num(input.atSec, 0, 0).toFixed(3),
    "-i", input.inputPath,
    "-frames:v", "1",
    input.outPath,
  ]);
  return {
    toolId: "local.frame-sample",
    artifacts: [{ kind: "image", path: input.outPath }],
    metadata: { atSec: input.atSec ?? 0 },
  };
}

export function runProviderTool(id: string, input: ProviderToolInput): ToolRunResult {
  switch (id) {
    case "local.caption-card-image":
      return renderCaptionCardImage(input as CaptionCardImageInput);
    case "local.caption-card-video":
      return renderCaptionCardVideo(input as CaptionCardVideoInput);
    case "local.silent-voice":
      return generateSilentVoice(input as SilentVoiceInput);
    case "local.tone-score":
      return generateToneScore(input as ToneMusicInput);
    case "local.timeline-subtitles":
      return exportTimelineSubtitles(input as SubtitleInput);
    case "local.video-trim":
      return trimVideo(input as TrimInput);
    case "local.video-stitch":
      return stitchVideos(input as StitchInput);
    case "local.media-probe":
      return probeMedia(input as ProbeInput);
    case "local.frame-sample":
      return sampleFrame(input as FrameSampleInput);
    default:
      throw new Error(`unknown provider tool "${id}"`);
  }
}

export function timelineToCaptionCardVideos(timeline: Timeline, outDir: string): ToolRunResult[] {
  return timelineToScenePlan(timeline).scenes.map((scene, index) => renderCaptionCardVideo({
    title: scene.title,
    durationSec: scene.durationSec,
    width: timeline.composition.width,
    height: timeline.composition.height,
    fps: timeline.composition.fps,
    background: scene.background,
    outPath: join(outDir, `scene-${index + 1}.mp4`),
  }));
}

// Media provider registry (§C/§D/§E parity surface).
export * from "./registry";
export * from "./executor";
export * from "./audit";
// Local audio mixer + enhancer (§E, real ffmpeg).
export * from "./audio";
// Post-production / enhancement (§F): real ffmpeg passes + model-enhancer catalogue.
export * from "./post";
