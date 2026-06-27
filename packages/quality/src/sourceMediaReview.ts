// @montara/quality — source media review helper.
// Standardizes inspection of user-supplied media so pipelines stop reinventing
// partial checks. Produces a normalized source_media_review artifact via a real
// ffprobe pass (with optional analysis-tool registry hooks for richer probing).
//
// Contract: if user-supplied media exists, a review is REQUIRED before the first
// planning stage that depends on creative assumptions. Never claim a file was
// reviewed unless a real probe ran.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";

export type MediaType = "video" | "audio" | "image";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".opus"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".svg"]);

export interface SourceReviewTool {
  execute(inputs: Record<string, unknown>): { success: boolean; data?: Record<string, unknown> };
  getStatus?(): string;
}
export interface SourceReviewToolRegistry {
  get(name: string): SourceReviewTool | null | undefined;
}

interface ProbeResult {
  technical_probe: Record<string, unknown>;
  quality_risks: string[];
  representative_frames?: string[];
}

export interface ReviewedFile {
  path: string;
  media_type: MediaType;
  reviewed: boolean;
  technical_probe: Record<string, unknown>;
  quality_risks: string[];
  representative_frames: string[];
  transcript_summary?: string;
  content_summary: string;
  usable_for: string[];
}

export interface SourceMediaReview {
  version: string;
  files: ReviewedFile[];
  summary: string;
  planning_implications: string[];
}

/** Classify a file as video, audio, or image by extension. */
export function detectMediaType(path: string): MediaType | null {
  const ext = extname(path).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return null;
}

function ffprobeJson(path: string): { format: Record<string, unknown>; streams: Record<string, unknown>[] } | null {
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path,
  ], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const data = JSON.parse(r.stdout) as { format?: Record<string, unknown>; streams?: Record<string, unknown>[] };
    return { format: data.format ?? {}, streams: data.streams ?? [] };
  } catch {
    return null;
  }
}

function numField(obj: Record<string, unknown>, key: string, fallback = 0): number {
  const v = obj[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function strField(obj: Record<string, unknown>, key: string, fallback = ""): string {
  const v = obj[key];
  return typeof v === "string" ? v : (typeof v === "number" ? String(v) : fallback);
}

function streamOfType(streams: Record<string, unknown>[], codecType: string): Record<string, unknown> {
  return streams.find((s) => s.codec_type === codecType) ?? {};
}

function probeVideo(path: string, registry?: SourceReviewToolRegistry | null): ProbeResult {
  const result: ProbeResult = { technical_probe: {}, representative_frames: [], quality_risks: [] };

  const probe = registry?.get("audio_probe");
  if (probe) {
    try {
      const r = probe.execute({ input_path: path });
      if (r.success && r.data) result.technical_probe = r.data;
    } catch { /* fall through to ffprobe */ }
  }

  if (!Object.keys(result.technical_probe).length) {
    const data = ffprobeJson(path);
    if (data) {
      const fmt = data.format;
      const videoStream = streamOfType(data.streams, "video");
      const audioStream = streamOfType(data.streams, "audio");
      const hasAudio = Object.keys(audioStream).length > 0;
      result.technical_probe = {
        duration_seconds: numField(fmt, "duration", 0),
        resolution: `${videoStream.width ?? "?"}x${videoStream.height ?? "?"}`,
        fps: parseFps(strField(videoStream, "r_frame_rate", "0/1")),
        codec: strField(videoStream, "codec_name", "unknown"),
        audio_codec: strField(audioStream, "codec_name", ""),
        sample_rate: hasAudio ? Math.trunc(numField(audioStream, "sample_rate", 0)) : 0,
        channels: hasAudio ? Math.trunc(numField(audioStream, "channels", 0)) : 0,
        file_size_bytes: Math.trunc(numField(fmt, "size", 0)),
        bitrate_kbps: round1(numField(fmt, "bit_rate", 0) / 1000),
      };
    } else {
      result.quality_risks.push("Could not probe file");
    }
  }

  // Sample frames (only if a frame_sampler tool is wired in).
  const frameSampler = registry?.get("frame_sampler");
  if (frameSampler) {
    try {
      const duration = numField(result.technical_probe, "duration_seconds", 0);
      const timestamps = sampleTimestamps(duration, 4);
      const r = frameSampler.execute({ input_path: path, timestamps, output_dir: `${path}.source_review_frames` });
      if (r.success && r.data && Array.isArray(r.data.frame_paths)) {
        result.representative_frames = r.data.frame_paths.map((p) => String(p));
      }
    } catch { /* leave frames empty */ }
  }

  const tp = result.technical_probe;
  if (Object.keys(tp).length) {
    const res = strField(tp, "resolution");
    if (res && res.includes("x")) {
      const [w, h] = res.split("x");
      const wn = Number(w);
      const hn = Number(h);
      if (Number.isFinite(wn) && Number.isFinite(hn) && (wn < 720 || hn < 480)) {
        result.quality_risks.push(`Low resolution (${res}) — may appear pixelated in final output`);
      }
    }
    if (numField(tp, "channels", 0) === 1) {
      result.quality_risks.push("Mono audio — consider if stereo output is expected");
    }
    if (numField(tp, "duration_seconds", 0) < 3) {
      result.quality_risks.push("Very short clip (<3s) — limited usability");
    }
  }

  return result;
}

function probeAudio(path: string, registry?: SourceReviewToolRegistry | null): ProbeResult {
  const result: ProbeResult = { technical_probe: {}, quality_risks: [] };

  const probe = registry?.get("audio_probe");
  if (probe) {
    try {
      const r = probe.execute({ input_path: path });
      if (r.success && r.data) result.technical_probe = r.data;
    } catch { /* fall through */ }
  }

  if (!Object.keys(result.technical_probe).length) {
    const data = ffprobeJson(path);
    if (data) {
      const fmt = data.format;
      const stream = streamOfType(data.streams, "audio");
      result.technical_probe = {
        duration_seconds: numField(fmt, "duration", 0),
        audio_codec: strField(stream, "codec_name", "unknown"),
        sample_rate: Math.trunc(numField(stream, "sample_rate", 0)),
        channels: Math.trunc(numField(stream, "channels", 0)),
        file_size_bytes: Math.trunc(numField(fmt, "size", 0)),
        bitrate_kbps: round1(numField(fmt, "bit_rate", 0) / 1000),
      };
    } else {
      result.quality_risks.push("Could not probe audio");
    }
  }

  return result;
}

function probeImage(path: string): ProbeResult {
  const result: ProbeResult = { technical_probe: {}, quality_risks: [] };
  const data = ffprobeJson(path);
  if (data) {
    const stream = streamOfType(data.streams, "video");
    const w = Math.trunc(numField(stream, "width", 0));
    const h = Math.trunc(numField(stream, "height", 0));
    let size = 0;
    try { size = statSync(path).size; } catch { size = 0; }
    result.technical_probe = {
      resolution: `${w}x${h}`,
      file_size_bytes: size,
      codec: strField(stream, "codec_name", "unknown"),
    };
    if (w < 640 || h < 480) {
      result.quality_risks.push(`Low resolution (${w}x${h}) — may need upscaling`);
    }
  } else {
    let size = 0;
    try { size = statSync(path).size; } catch { size = 0; }
    result.technical_probe = { file_size_bytes: size };
  }
  return result;
}

function transcribeIfAvailable(path: string, mediaType: MediaType, registry?: SourceReviewToolRegistry | null): string | null {
  if (mediaType !== "video" && mediaType !== "audio") return null;
  const transcriber = registry?.get("transcriber");
  if (!transcriber) return null;
  try {
    if (transcriber.getStatus?.() === "available") {
      const r = transcriber.execute({ input_path: path });
      if (r.success && r.data) {
        const text = typeof r.data.text === "string" ? r.data.text : "";
        if (text) {
          const words = text.split(/\s+/).filter(Boolean);
          if (words.length > 100) return `${words.slice(0, 100).join(" ")}... (${words.length} words total)`;
          return text;
        }
      }
    }
  } catch { /* transcription failed — degrade to none */ }
  return null;
}

/** Review user-supplied media files and produce a source_media_review artifact. */
export function reviewSourceMedia(
  files: string[],
  _context: Record<string, unknown> = {},
  toolRegistry?: SourceReviewToolRegistry | null,
): SourceMediaReview {
  const reviewedFiles: ReviewedFile[] = [];
  const allImplications: string[] = [];
  const summaries: string[] = [];

  for (const filePath of files) {
    const mediaType = detectMediaType(filePath);
    if (mediaType === null) continue;
    if (!existsSync(filePath)) continue;

    let probeData: ProbeResult;
    if (mediaType === "video") probeData = probeVideo(filePath, toolRegistry);
    else if (mediaType === "audio") probeData = probeAudio(filePath, toolRegistry);
    else probeData = probeImage(filePath);

    const probe = probeData.technical_probe;
    const transcript = transcribeIfAvailable(filePath, mediaType, toolRegistry);

    let contentSummary: string;
    let usableFor: string[];
    if (mediaType === "video") {
      const dur = numField(probe, "duration_seconds", 0);
      const res = strField(probe, "resolution", "unknown");
      const hasAudio = Boolean(strField(probe, "audio_codec", ""));
      contentSummary = `Video file: ${dur.toFixed(1)}s at ${res}, ${hasAudio ? "with" : "without"} audio`;
      usableFor = inferVideoUsability(probe, transcript);
    } else if (mediaType === "audio") {
      const dur = numField(probe, "duration_seconds", 0);
      contentSummary = `Audio file: ${dur.toFixed(1)}s, ${strField(probe, "audio_codec", "unknown")}`;
      usableFor = inferAudioUsability(probe, transcript);
    } else {
      const res = strField(probe, "resolution", "unknown");
      contentSummary = `Image file: ${res}`;
      usableFor = ["visual asset", "reference image"];
    }

    const entry: ReviewedFile = {
      path: filePath,
      media_type: mediaType,
      reviewed: true,
      technical_probe: probe,
      quality_risks: probeData.quality_risks,
      representative_frames: probeData.representative_frames ?? [],
      content_summary: contentSummary,
      usable_for: usableFor,
    };
    if (transcript) entry.transcript_summary = transcript;

    summaries.push(`${basename(filePath)}: ${contentSummary}`);
    reviewedFiles.push(entry);

    for (const risk of entry.quality_risks) {
      allImplications.push(`Quality risk in ${basename(filePath)}: ${risk}`);
    }
  }

  let summary: string;
  if (!reviewedFiles.length) {
    summary = "No user-supplied media files could be reviewed.";
    allImplications.push("No source media available — production is fully generated.");
  } else {
    summary = summaries.join("; ");
  }

  const hasVideo = reviewedFiles.some((f) => f.media_type === "video");
  const hasAudio = reviewedFiles.some((f) => f.media_type === "audio");
  const hasImages = reviewedFiles.some((f) => f.media_type === "image");

  if (hasVideo) allImplications.push("Source video available — consider source-led or hybrid production approach");
  if (hasAudio && !hasVideo) allImplications.push("Audio-only source — production needs visual assets to accompany audio");
  if (hasImages && !hasVideo) allImplications.push("Image-only source — motion must come from animation or video generation");

  if (!allImplications.length) allImplications.push("No specific constraints identified from source media.");

  return { version: "1.0", files: reviewedFiles, summary, planning_implications: allImplications };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Parse an ffprobe fps string like '30/1' or '24000/1001'. */
export function parseFps(fpsStr: string): number {
  try {
    if (fpsStr.includes("/")) {
      const [num, den] = fpsStr.split("/");
      const n = parseInt(num ?? "0", 10);
      const d = parseInt(den ?? "0", 10);
      if (!Number.isFinite(n) || !Number.isFinite(d)) return 0.0;
      return Math.round((n / Math.max(d, 1)) * 100) / 100;
    }
    const f = Number(fpsStr);
    return Number.isFinite(f) ? f : 0.0;
  } catch {
    return 0.0;
  }
}

/** Evenly-spaced sample timestamps for a given duration. */
export function sampleTimestamps(duration: number, count = 4): number[] {
  if (duration <= 0) return [0.0];
  if (count <= 1) return [duration / 2];
  const step = duration / (count + 1);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.round(step * (i + 1) * 100) / 100);
  return out;
}

function inferVideoUsability(probe: Record<string, unknown>, transcript: string | null): string[] {
  const uses: string[] = [];
  const dur = numField(probe, "duration_seconds", 0);
  if (dur > 10) uses.push("hero footage");
  if (dur > 3) uses.push("b-roll");
  if (transcript) uses.push("source dialogue");
  if (strField(probe, "audio_codec", "")) uses.push("source audio");
  return uses.length ? uses : ["short clip"];
}

function inferAudioUsability(probe: Record<string, unknown>, transcript: string | null): string[] {
  const uses: string[] = [];
  const dur = numField(probe, "duration_seconds", 0);
  if (transcript) uses.push("narration source");
  if (dur > 30) uses.push("background music candidate");
  if (dur > 5) uses.push("sound effect or ambient");
  return uses.length ? uses : ["audio clip"];
}

/** Check if a directory contains user-supplied media files. */
export function hasUserMedia(projectDir: string): boolean {
  if (!existsSync(projectDir)) return false;
  let entries;
  try {
    entries = readdirSync(projectDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isDirectory()) continue;
    const ext = extname(e.name).toLowerCase();
    if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) return true;
  }
  return false;
}
