// @montara/render-engines — the AUTO picker + dispatcher.
// "Which renderer is best for this scene, and is it actually installed right now?" An LLM, an
// editor, or the orchestrator calls recommendEngine() to choose, or autoRenderScene() to just get
// a real clip back. Native engines (three.js WebGL, Blender, Remotion) are used when present;
// otherwise it degrades to the ffmpeg compositor so a clip is ALWAYS produced.

import { renderScenePlan } from "../../render-ffmpeg/src/index";
import { threeAvailable, renderThreeScene } from "../../render-three/src/index";
import { blenderAvailable, renderBlenderScene } from "../../render-blender/src/index";
import { manimAvailable, renderManimScene } from "../../render-manim/src/index";
import { revideoAvailable } from "../../render-revideo/src/index";
import { motionCanvasAvailable } from "../../render-motioncanvas/src/index";
import { remotionNativeAvailable } from "../../render-remotion/src/index";
import { join } from "node:path";
import { preferredEngine, RENDER_ENGINES, type EngineId, type RenderEngine } from "./index";

/** Real, runtime availability of each engine (probes the actual toolchain, not just an env flag). */
export function engineReallyAvailable(id: EngineId): boolean {
  switch (id) {
    case "ffmpeg": return true;
    case "three": return threeAvailable();
    case "blender": return blenderAvailable();
    case "manim": return manimAvailable();
    case "revideo": return revideoAvailable();
    case "motion-canvas": return motionCanvasAvailable();
    case "remotion": return remotionNativeAvailable();
    default: return false;
  }
}

export interface EngineRecommendation {
  sceneType: string;
  preferred: EngineId;     // best engine for this scene type, installed or not
  engine: EngineId;        // the one that will actually run (preferred if available, else ffmpeg)
  native: boolean;         // true when a real native engine runs (not the ffmpeg degrade)
  available: boolean;      // whether the preferred engine is installed
  reason: string;
}

/** Recommend the best installed renderer for a scene type (the "auto-pick" an LLM/editor calls). */
export function recommendEngine(sceneType: string): EngineRecommendation {
  const preferred = preferredEngine(sceneType);
  const available = engineReallyAvailable(preferred.id);
  const engine: EngineId = available ? preferred.id : "ffmpeg";
  const native = engine !== "ffmpeg";
  const reason = available
    ? `${preferred.name} fits '${sceneType}' and is installed`
    : `${preferred.name} fits '${sceneType}' but is not installed → ffmpeg compositor`;
  return { sceneType, preferred: preferred.id, engine, native, available, reason };
}

/** Engines with a real native adapter available right now (for `montara engines`, GUIs, doctor). */
export function availableEngines(): { engine: RenderEngine; available: boolean; native: boolean }[] {
  return RENDER_ENGINES.map((engine) => {
    const available = engineReallyAvailable(engine.id);
    return { engine, available, native: engine.id !== "ffmpeg" && available };
  });
}

export interface AutoSceneRequest {
  sceneType: string;
  outPath: string;
  title?: string;
  width?: number;
  height?: number;
  fps?: number;
  seconds?: number;
  background?: string;
  /** Blender python script (defaults to the bundled intro). */
  blenderScript?: string;
}

export interface AutoSceneResult {
  ok: boolean;
  engine: EngineId;
  native: boolean;
  path: string;
  frames?: number;
  error?: string;
}

/** Pick the best installed renderer for the scene type and actually render a real clip. */
export function autoRenderScene(req: AutoSceneRequest): AutoSceneResult {
  const rec = recommendEngine(req.sceneType);
  const width = req.width ?? 1280, height = req.height ?? 720, fps = req.fps ?? 24, seconds = req.seconds ?? 1.5;

  if (rec.engine === "three") {
    const r = renderThreeScene(req.outPath, { width, height, fps, seconds, title: req.title, background: req.background });
    return { ok: r.ok, engine: "three", native: true, path: r.path, frames: r.frames, error: r.error };
  }
  if (rec.engine === "blender") {
    const script = req.blenderScript ?? join(process.cwd(), "blender", "montara_intro.py");
    const r = renderBlenderScene(script, req.outPath, { fps });
    return { ok: r.ok, engine: "blender", native: true, path: r.path ?? req.outPath, frames: r.frames, error: r.error };
  }
  if (rec.engine === "manim") {
    const r = renderManimScene(req.outPath, { quality: "l" });
    return { ok: r.ok, engine: "manim", native: true, path: r.path, error: r.error };
  }
  // ffmpeg fallback: a single titled scene
  try {
    renderScenePlan({ width, height, fps, scenes: [{ id: "auto", title: req.title ?? "", durationSec: seconds, background: req.background ?? "0a0a0a" }] }, req.outPath);
    return { ok: true, engine: "ffmpeg", native: false, path: req.outPath };
  } catch (e) {
    return { ok: false, engine: "ffmpeg", native: false, path: req.outPath, error: String((e as Error).message ?? e) };
  }
}
