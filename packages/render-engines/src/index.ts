// @montara/render-engines - composition/capture engine registry.
// This registry is deliberately honest: some engines have native adapters
// today, some are runtime-gated, and some are planned entries kept visible so
// agents can report capability gaps instead of treating FFmpeg degradation as
// native rendering.

import type { Timeline } from "../../core/src/index";
import { renderTimeline } from "../../render-ffmpeg/src/index";

export type EngineId =
  | "ffmpeg"
  | "remotion"
  | "revideo"
  | "motion-canvas"
  | "three"
  | "manim"
  | "blender"
  | "spline"
  | "playwright";

export interface RenderEngine {
  id: EngineId;
  name: string;
  role: string;
  sceneTypes: string[];
  /** Optional env var that may hint the runtime is configured. Real probes live in autoRender.ts. */
  availabilityEnv?: string;
  license: string;
  maturity: "working" | "adapter" | "runtime-gated" | "planned";
}

export interface EngineRenderResult {
  engine: EngineId;
  renderer: "native" | "degraded-ffmpeg";
  outPath: string;
  note: string;
}

export const RENDER_ENGINES: RenderEngine[] = [
  {
    id: "ffmpeg",
    name: "FFmpeg",
    role: "assembly + universal fallback",
    sceneTypes: ["assembly", "caption-card"],
    license: "LGPL/GPL",
    maturity: "working",
  },
  {
    id: "remotion",
    name: "Remotion",
    role: "React composition surface",
    sceneTypes: ["explainer", "stat-reveal", "captions"],
    availabilityEnv: "REMOTION_ENABLED",
    license: "source-available",
    maturity: "adapter",
  },
  {
    id: "revideo",
    name: "Revideo",
    role: "license-safe composition fallback",
    sceneTypes: ["explainer-mit", "captions"],
    availabilityEnv: "REVIDEO_ENABLED",
    license: "MIT",
    maturity: "runtime-gated",
  },
  {
    id: "motion-canvas",
    name: "Motion Canvas",
    role: "kinetic typography / motion graphics",
    sceneTypes: ["kinetic-typography", "motion-graphics"],
    availabilityEnv: "MOTIONCANVAS_ENABLED",
    license: "MIT",
    maturity: "runtime-gated",
  },
  {
    id: "three",
    name: "three.js",
    role: "3D scenes / titles",
    sceneTypes: ["3d", "title-3d"],
    availabilityEnv: "THREE_ENABLED",
    license: "MIT",
    maturity: "runtime-gated",
  },
  {
    id: "manim",
    name: "Manim",
    role: "math / educational animation",
    sceneTypes: ["math", "diagram"],
    availabilityEnv: "MANIM_BIN",
    license: "MIT",
    maturity: "runtime-gated",
  },
  {
    id: "blender",
    name: "Blender",
    role: "pro 3D (shell)",
    sceneTypes: ["3d-pro"],
    availabilityEnv: "BLENDER_BIN",
    license: "GPL",
    maturity: "runtime-gated",
  },
  {
    id: "spline",
    name: "Spline",
    role: "interactive/web 3D capture",
    sceneTypes: ["web-3d", "spline"],
    license: "SaaS/export-dependent",
    maturity: "planned",
  },
  {
    id: "playwright",
    name: "Playwright",
    role: "browser capture / website trailer recording",
    sceneTypes: ["website-demo", "browser-recording"],
    license: "Apache-2.0",
    maturity: "runtime-gated",
  },
];

export * from "./autoRender";

export function listEngines(): RenderEngine[] {
  return [...RENDER_ENGINES];
}

export function getEngine(id: string): RenderEngine | undefined {
  return RENDER_ENGINES.find((e) => e.id === id);
}

export function engineAvailable(engine: RenderEngine, secrets: Record<string, string | undefined> = process.env): boolean {
  if (engine.id === "ffmpeg") return true;
  return Boolean(engine.availabilityEnv && secrets[engine.availabilityEnv]);
}

/** The engine best suited to a scene type, regardless of whether it is currently installed. */
export function preferredEngine(sceneType: string): RenderEngine {
  return RENDER_ENGINES.find((e) => e.sceneTypes.includes(sceneType)) ?? getEngine("ffmpeg")!;
}

/** Resolve the engine that will actually run according to env hints only. */
export function selectEngine(
  sceneType: string,
  secrets: Record<string, string | undefined> = process.env,
): { preferred: RenderEngine; engine: RenderEngine; degraded: boolean } {
  const preferred = preferredEngine(sceneType);
  if (engineAvailable(preferred, secrets)) {
    return { preferred, engine: preferred, degraded: preferred.id !== "ffmpeg" ? false : false };
  }
  return { preferred, engine: getEngine("ffmpeg")!, degraded: true };
}

/**
 * Generic dispatcher fallback.
 *
 * Package-specific native adapters exist for selected engines, but this generic
 * dispatcher intentionally produces a verified FFmpeg fallback unless the
 * caller reaches for a concrete native adapter. This prevents a package name or
 * env var from being mistaken for a native render guarantee.
 */
export function renderWithEngine(
  engineId: EngineId,
  timeline: Timeline,
  outPath: string,
  secrets: Record<string, string | undefined> = process.env,
): EngineRenderResult {
  const engine = getEngine(engineId) ?? getEngine("ffmpeg")!;
  renderTimeline(timeline, outPath);
  const renderer: EngineRenderResult["renderer"] = engine.id === "ffmpeg" ? "native" : "degraded-ffmpeg";
  void engineAvailable(engine, secrets);
  return {
    engine: engine.id,
    renderer,
    outPath,
    note: engine.id === "ffmpeg"
      ? "Rendered through the working FFmpeg path."
      : `${engine.name} native rendering is not proven through this generic dispatcher; produced a verified FFmpeg fallback MP4.`,
  };
}
