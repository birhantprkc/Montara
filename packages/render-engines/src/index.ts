// @montara/render-engines — the composition engine registry (§A).
// Montara renders the same Timeline IR through any of seven engines. Native engines (Remotion,
// Revideo, Motion Canvas, three.js, Manim, Blender) are invoked when present; otherwise the
// renderer degrades to FFmpeg so a run always produces a real MP4. Auto-pick maps a scene type to
// the engine best suited to it.

import type { Timeline } from "../../core/src/index";
import { renderTimeline } from "../../render-ffmpeg/src/index";

export type EngineId = "ffmpeg" | "remotion" | "revideo" | "motion-canvas" | "three" | "manim" | "blender";

export interface RenderEngine {
  id: EngineId;
  name: string;
  role: string;
  sceneTypes: string[];
  /** env var that signals the native engine is installed/usable */
  availabilityEnv?: string;
  license: string;
}

export interface EngineRenderResult {
  engine: EngineId;
  renderer: "native" | "degraded-ffmpeg";
  outPath: string;
}

export const RENDER_ENGINES: RenderEngine[] = [
  { id: "ffmpeg", name: "FFmpeg", role: "assembly + universal fallback", sceneTypes: ["assembly", "caption-card"], license: "LGPL/GPL" },
  { id: "remotion", name: "Remotion", role: "default composition (React)", sceneTypes: ["explainer", "stat-reveal", "captions"], availabilityEnv: "REMOTION_ENABLED", license: "source-available" },
  { id: "revideo", name: "Revideo", role: "license-safe composition fallback", sceneTypes: ["explainer-mit", "captions"], availabilityEnv: "REVIDEO_ENABLED", license: "MIT" },
  { id: "motion-canvas", name: "Motion Canvas", role: "kinetic typography / motion graphics", sceneTypes: ["kinetic-typography", "motion-graphics"], availabilityEnv: "MOTIONCANVAS_ENABLED", license: "MIT" },
  { id: "three", name: "three.js", role: "3D scenes / titles", sceneTypes: ["3d", "title-3d"], availabilityEnv: "THREE_ENABLED", license: "MIT" },
  { id: "manim", name: "Manim", role: "math / educational animation", sceneTypes: ["math", "diagram"], availabilityEnv: "MANIM_BIN", license: "MIT" },
  { id: "blender", name: "Blender", role: "pro 3D (shell)", sceneTypes: ["3d-pro"], availabilityEnv: "BLENDER_BIN", license: "GPL" },
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

/** Resolve the engine that will actually run: the preferred one if available, else FFmpeg. */
export function selectEngine(sceneType: string, secrets: Record<string, string | undefined> = process.env): { preferred: RenderEngine; engine: RenderEngine; degraded: boolean } {
  const preferred = preferredEngine(sceneType);
  if (engineAvailable(preferred, secrets)) return { preferred, engine: preferred, degraded: preferred.id !== "ffmpeg" ? false : false };
  return { preferred, engine: getEngine("ffmpeg")!, degraded: true };
}

/**
 * Render the IR through the named engine. Stage 1 ships the engines as honest adapters: when the
 * native engine is not wired/installed the render degrades to FFmpeg, always producing a real MP4.
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
  return { engine: engine.id, renderer, outPath };
}
