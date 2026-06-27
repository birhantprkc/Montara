// @montara/providers — post-production / enhancement (§F).
// Real, offline ffmpeg passes: color grade, crossfade stitch, picture-in-picture, lanczos upscale.
// Plus the model-based enhancement catalogue (upscale / bg-remove / face / avatar / lip-sync) as a
// registry gated on a local runtime; offline those are "unavailable" and the caller degrades.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolRunResult } from "./index";
import { mediaBin, probeDuration } from "../../render-ffmpeg/src/index";

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || "").slice(-800);
    throw new Error(`${bin} failed (exit ${r.status}): ${tail}`);
  }
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

const X264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-crf", "23"];

export interface ColorGradeInput {
  inputPath: string;
  outPath: string;
  /** path to a .cube 3D LUT; when omitted, an eq-based grade is applied */
  lut?: string;
  contrast?: number;
  brightness?: number;
  saturation?: number;
}

export function colorGrade(input: ColorGradeInput): ToolRunResult {
  ensureParent(input.outPath);
  const vf = input.lut
    ? `lut3d='${input.lut.replace(/\\/g, "/")}'`
    : `eq=contrast=${(input.contrast ?? 1.08).toFixed(3)}:brightness=${(input.brightness ?? 0.02).toFixed(3)}:saturation=${(input.saturation ?? 1.12).toFixed(3)}`;
  run(mediaBin("ffmpeg"), ["-y", "-i", input.inputPath, "-vf", vf, ...X264, "-c:a", "copy", input.outPath]);
  return { toolId: "local.color-grade", artifacts: [{ kind: "video", path: input.outPath }], metadata: { lut: input.lut ?? "eq" } };
}

export interface CrossfadeInput {
  inputPaths: string[];
  outPath: string;
  crossfadeSec?: number;
}

function crossfadePair(a: string, b: string, out: string, d: number): void {
  const offset = Math.max(0, probeDuration(a) - d);
  run(mediaBin("ffmpeg"), [
    "-y", "-i", a, "-i", b,
    "-filter_complex",
    `[0:v][1:v]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${offset.toFixed(3)}[v];[0:a][1:a]acrossfade=d=${d.toFixed(3)}[a]`,
    "-map", "[v]", "-map", "[a]", ...X264, "-c:a", "aac", "-ar", "48000", "-ac", "2", out,
  ]);
}

/** Crossfade a list of clips into one (chained pairwise through temp files). */
export function crossfadeStitch(input: CrossfadeInput): ToolRunResult {
  if (input.inputPaths.length === 0) throw new Error("crossfadeStitch requires at least one clip");
  ensureParent(input.outPath);
  const d = input.crossfadeSec ?? 0.4;
  const first = input.inputPaths[0]!;
  if (input.inputPaths.length === 1) {
    run(mediaBin("ffmpeg"), ["-y", "-i", first, ...X264, "-c:a", "aac", input.outPath]);
    return { toolId: "local.crossfade-stitch", artifacts: [{ kind: "video", path: input.outPath }], metadata: { clips: 1 } };
  }
  const work = join(tmpdir(), `montara-xfade-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  let acc = first;
  for (let i = 1; i < input.inputPaths.length; i++) {
    const next = input.inputPaths[i]!;
    const out = i === input.inputPaths.length - 1 ? input.outPath : join(work, `acc-${i}.mp4`);
    crossfadePair(acc, next, out, d);
    acc = out;
  }
  return { toolId: "local.crossfade-stitch", artifacts: [{ kind: "video", path: input.outPath }], metadata: { clips: input.inputPaths.length, crossfadeSec: d } };
}

export type PipPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface PipInput {
  basePath: string;
  overlayPath: string;
  outPath: string;
  scale?: number;
  position?: PipPosition;
}

export function pictureInPicture(input: PipInput): ToolRunResult {
  ensureParent(input.outPath);
  const scale = input.scale ?? 0.3;
  const m = 24;
  const pos: Record<PipPosition, string> = {
    "top-left": `${m}:${m}`,
    "top-right": `W-w-${m}:${m}`,
    "bottom-left": `${m}:H-h-${m}`,
    "bottom-right": `W-w-${m}:H-h-${m}`,
  };
  const xy = pos[input.position ?? "bottom-right"];
  run(mediaBin("ffmpeg"), [
    "-y", "-i", input.basePath, "-i", input.overlayPath,
    "-filter_complex", `[1:v]scale=iw*${scale}:ih*${scale}[pip];[0:v][pip]overlay=${xy}[v]`,
    "-map", "[v]", "-map", "0:a?", ...X264, "-c:a", "aac", "-shortest", input.outPath,
  ]);
  return { toolId: "local.picture-in-picture", artifacts: [{ kind: "video", path: input.outPath }], metadata: { scale, position: input.position ?? "bottom-right" } };
}

export interface UpscaleInput {
  inputPath: string;
  outPath: string;
  /** linear scale factor, default 2 */
  factor?: number;
}

/** Local lanczos upscale (the always-available path; Real-ESRGAN is the BYO-runtime upgrade). */
export function upscaleVideo(input: UpscaleInput): ToolRunResult {
  ensureParent(input.outPath);
  const factor = Math.max(1, input.factor ?? 2);
  run(mediaBin("ffmpeg"), [
    "-y", "-i", input.inputPath,
    "-vf", `scale=iw*${factor}:ih*${factor}:flags=lanczos`,
    ...X264, "-c:a", "copy", input.outPath,
  ]);
  return { toolId: "local.upscale", artifacts: [{ kind: "video", path: input.outPath }], metadata: { factor } };
}

// ---- model-based enhancement catalogue (BYO local runtime) -----------------
export type EnhancementKind = "upscale" | "bg-remove" | "face-enhance" | "face-restore" | "talking-head" | "lip-sync";

export interface EnhancementTool {
  id: string;
  name: string;
  vendor: string;
  kind: EnhancementKind;
  /** env var pointing at the local runtime/binary that powers this enhancer */
  runtimeEnv: string;
  /** a real local fallback exists in-repo (e.g. ffmpeg upscale) */
  hasLocalFallback: boolean;
  notes: string;
}

export const ENHANCEMENT_TOOLS: EnhancementTool[] = [
  { id: "real-esrgan", name: "Real-ESRGAN", vendor: "xinntao", kind: "upscale", runtimeEnv: "REALESRGAN_BIN", hasLocalFallback: true, notes: "AI super-resolution; falls back to lanczos upscale." },
  { id: "rembg", name: "rembg (U2Net)", vendor: "danielgatis", kind: "bg-remove", runtimeEnv: "REMBG_URL", hasLocalFallback: false, notes: "Background removal / matting." },
  { id: "gfpgan", name: "GFPGAN", vendor: "TencentARC", kind: "face-enhance", runtimeEnv: "GFPGAN_BIN", hasLocalFallback: false, notes: "Face enhancement." },
  { id: "codeformer", name: "CodeFormer", vendor: "sczhou", kind: "face-restore", runtimeEnv: "CODEFORMER_BIN", hasLocalFallback: false, notes: "Face restoration." },
  { id: "sadtalker", name: "SadTalker", vendor: "OpenTalker", kind: "talking-head", runtimeEnv: "SADTALKER_URL", hasLocalFallback: false, notes: "Audio-driven talking-head avatar." },
  { id: "wav2lip", name: "Wav2Lip", vendor: "Rudrabha", kind: "lip-sync", runtimeEnv: "WAV2LIP_URL", hasLocalFallback: false, notes: "Lip-sync a face to a voice track." },
];

export function listEnhancementTools(): EnhancementTool[] {
  return [...ENHANCEMENT_TOOLS];
}

export function getEnhancementTool(id: string): EnhancementTool | undefined {
  return ENHANCEMENT_TOOLS.find((t) => t.id === id);
}

export function enhancementAvailable(tool: EnhancementTool, secrets: Record<string, string | undefined> = process.env): boolean {
  return Boolean(secrets[tool.runtimeEnv]);
}
