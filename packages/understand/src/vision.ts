// Optional local vision-model path for @montara/understand.
// The default understandVideo() path stays synchronous and zero-key. This module
// is opt-in so CI never downloads model weights, while machines with
// Transformers.js installed can run real CLIP-style frame classification.

import { existsSync } from "node:fs";
import { join } from "node:path";

export type VisionMode = "off" | "auto" | "require";

export interface VisionModelStatus {
  backend: "transformers.js";
  available: boolean;
  enabled: boolean;
  packageName?: string;
  clipModel: string;
  captionModel?: string;
  reason?: string;
  installHint: string;
}

export interface VisionFrameAnalysis {
  framePath: string;
  labels: { label: string; score: number }[];
  caption?: string;
}

export interface VisionModelAnalysis {
  backend: "transformers.js";
  model: string;
  captionModel?: string;
  frameAnalyses: VisionFrameAnalysis[];
  tags: string[];
  caption?: string;
  status: VisionModelStatus;
}

export interface VisionModelOptions {
  mode?: VisionMode;
  env?: Record<string, string | undefined>;
  clipModel?: string;
  captionModel?: string;
  labels?: string[];
}

const DEFAULT_CLIP_MODEL = "Xenova/clip-vit-base-patch32";
const DEFAULT_LABELS = [
  "talking head",
  "person on camera",
  "software interface",
  "gameplay footage",
  "city street",
  "nature landscape",
  "documentary archive footage",
  "map or diagram",
  "product closeup",
  "sports action",
  "food",
  "vehicle",
  "space or satellite imagery",
  "text slide",
  "animation",
  "low light scene",
];

function truthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

function resolveTransformersPackage(): string | undefined {
  for (const name of ["@huggingface/transformers", "@xenova/transformers"]) {
    const packagePath = join(process.cwd(), "node_modules", ...name.split("/"), "package.json");
    if (existsSync(packagePath)) {
      return name;
    }
  }
  return undefined;
}

function dynamicImport(): (specifier: string) => Promise<Record<string, unknown>> {
  return new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Record<string, unknown>>;
}

export function visionModelStatus(options: VisionModelOptions = {}): VisionModelStatus {
  const env = options.env ?? process.env;
  const mode = options.mode ?? "auto";
  const packageName = resolveTransformersPackage();
  const enabled = mode === "require" || (mode === "auto" && truthy(env.MONTARA_VISION_MODELS));
  const clipModel = options.clipModel ?? env.MONTARA_CLIP_MODEL ?? DEFAULT_CLIP_MODEL;
  const captionModel = options.captionModel ?? env.MONTARA_CAPTION_MODEL ?? env.MONTARA_BLIP_MODEL;

  if (mode === "off") {
    return {
      backend: "transformers.js",
      available: Boolean(packageName),
      enabled: false,
      packageName,
      clipModel,
      captionModel,
      reason: "vision models disabled for this run",
      installHint: "Enable with --vision auto and MONTARA_VISION_MODELS=1, or use --vision require.",
    };
  }

  if (!packageName) {
    return {
      backend: "transformers.js",
      available: false,
      enabled,
      clipModel,
      captionModel,
      reason: "Transformers.js package is not installed",
      installHint: "Install @huggingface/transformers (or @xenova/transformers) and set MONTARA_VISION_MODELS=1 for opt-in local CLIP analysis.",
    };
  }

  if (!enabled) {
    return {
      backend: "transformers.js",
      available: true,
      enabled: false,
      packageName,
      clipModel,
      captionModel,
      reason: "installed but not enabled; model downloads are opt-in",
      installHint: "Set MONTARA_VISION_MODELS=1 or pass --vision require to run local CLIP analysis.",
    };
  }

  return {
    backend: "transformers.js",
    available: true,
    enabled: true,
    packageName,
    clipModel,
    captionModel,
    installHint: captionModel
      ? "CLIP classification and configured caption model are enabled."
      : "CLIP classification is enabled. Set MONTARA_CAPTION_MODEL or MONTARA_BLIP_MODEL for image-to-text captions.",
  };
}

function normalizeModelRows(raw: unknown): { label: string; score: number }[] {
  const rows = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const r = row as { label?: unknown; score?: unknown };
      return {
        label: String(r.label ?? "").trim(),
        score: Number(r.score ?? 0),
      };
    })
    .filter((row) => row.label)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function normalizeCaption(raw: unknown): string | undefined {
  const rows = Array.isArray(raw) ? raw : [raw];
  const first = rows[0] as { generated_text?: unknown; caption?: unknown } | undefined;
  const text = String(first?.generated_text ?? first?.caption ?? "").trim();
  return text || undefined;
}

export async function analyzeFramesWithVisionModels(
  framePaths: string[],
  options: VisionModelOptions = {},
): Promise<VisionModelAnalysis> {
  const status = visionModelStatus(options);
  if (!status.enabled || !status.available || !status.packageName) {
    if (options.mode === "require") {
      throw new Error(status.reason ?? "vision models unavailable");
    }
    return {
      backend: "transformers.js",
      model: status.clipModel,
      captionModel: status.captionModel,
      frameAnalyses: [],
      tags: [],
      status,
    };
  }

  const mod = await dynamicImport()(status.packageName);
  const pipeline = mod.pipeline as ((task: string, model: string) => Promise<(input: unknown, args?: unknown) => Promise<unknown>>) | undefined;
  if (!pipeline) throw new Error(`${status.packageName} does not expose pipeline()`);

  const labels = options.labels?.length ? options.labels : DEFAULT_LABELS;
  const classifier = await pipeline("zero-shot-image-classification", status.clipModel);
  const captioner = status.captionModel ? await pipeline("image-to-text", status.captionModel) : undefined;

  const frameAnalyses: VisionFrameAnalysis[] = [];
  for (const framePath of framePaths) {
    const classified = normalizeModelRows(await classifier(framePath, labels));
    const caption = captioner ? normalizeCaption(await captioner(framePath)) : undefined;
    frameAnalyses.push({ framePath, labels: classified, caption });
  }

  const tagScores = new Map<string, number>();
  for (const frame of frameAnalyses) {
    for (const row of frame.labels.slice(0, 3)) {
      tagScores.set(row.label, (tagScores.get(row.label) ?? 0) + row.score);
    }
  }
  const tags = [...tagScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 8);
  const caption = frameAnalyses.map((frame) => frame.caption).find(Boolean);

  return {
    backend: "transformers.js",
    model: status.clipModel,
    captionModel: status.captionModel,
    frameAnalyses,
    tags,
    caption,
    status,
  };
}
