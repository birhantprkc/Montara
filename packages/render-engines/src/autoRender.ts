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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getEngine, preferredEngine, RENDER_ENGINES, type EngineId, type RenderEngine } from "./index";

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

// ---------------------------------------------------------------------------
// Stage 2.5 — license-aware composition selection
// ---------------------------------------------------------------------------
// Montara's contract: Remotion is the DEFAULT composition engine, but
// it ships under a *source-available* license (not OSI-open). When a Remotion
// license/runtime is unavailable, Montara auto-falls-back to Revideo (MIT) — both
// compile the same Timeline IR — then Motion Canvas (MIT), then the FFmpeg floor.

/** Coarse license class used to decide license-safe composition fallbacks. */
export function engineLicenseClass(engine: RenderEngine): "open" | "source-available" | "proprietary" {
  const l = engine.license.toLowerCase();
  if (l.includes("mit") || l.includes("apache") || l.includes("gpl")) return "open";
  if (l.includes("source-available")) return "source-available";
  return "proprietary";
}

/** Ordered MIT-licensed composition fallbacks, tried when the preferred engine is unavailable or license-restricted. */
const OPEN_COMPOSITION_FALLBACKS: EngineId[] = ["revideo", "motion-canvas", "three"];

export interface CompositionSelection {
  sceneType: string;
  /** best engine for the scene type, installed or not */
  preferred: EngineId;
  /** engine that will actually run */
  engine: EngineId;
  license: string;
  native: boolean;
  /** true only when Montara deliberately switched OFF a source-available/proprietary engine to an open-licensed one */
  licenseFallback: boolean;
  reason: string;
}

/**
 * License-aware composition engine selection (Stage 2.5).
 *
 * Pure and deterministic: pass `available` to select without touching a real
 * toolchain (defaults to the real runtime probe). Set `allowSourceAvailable:false`
 * to decline Remotion's source-available license and force the MIT path.
 */
export function selectCompositionEngine(
  sceneType: string,
  available: (id: EngineId) => boolean = engineReallyAvailable,
  opts: { allowSourceAvailable?: boolean } = {},
): CompositionSelection {
  const allowSA = opts.allowSourceAvailable ?? true;
  const preferred = preferredEngine(sceneType);
  const cls = engineLicenseClass(preferred);
  const licenseOk = preferred.id === "ffmpeg" || cls === "open" || (cls === "source-available" && allowSA);

  if (available(preferred.id) && licenseOk) {
    return {
      sceneType, preferred: preferred.id, engine: preferred.id, license: preferred.license,
      native: preferred.id !== "ffmpeg", licenseFallback: false,
      reason: `${preferred.name} fits '${sceneType}' and is available (${preferred.license}).`,
    };
  }

  // Distinguish "switched because of license" from "switched because it isn't installed".
  const blockedByLicense = available(preferred.id) && !licenseOk;

  for (const id of OPEN_COMPOSITION_FALLBACKS) {
    if (id === preferred.id || !available(id)) continue;
    const e = getEngine(id)!;
    return {
      sceneType, preferred: preferred.id, engine: id, license: e.license, native: true,
      licenseFallback: blockedByLicense,
      reason: blockedByLicense
        ? `${preferred.name} is ${preferred.license}; auto-switched to ${e.name} (${e.license}) for a license-safe composition.`
        : `${preferred.name} is not installed; using ${e.name} (${e.license}) as the license-safe composition fallback.`,
    };
  }

  return {
    sceneType, preferred: preferred.id, engine: "ffmpeg", license: getEngine("ffmpeg")!.license,
    native: false, licenseFallback: blockedByLicense,
    reason: `No native composition engine available for '${sceneType}'; rendering through the FFmpeg floor.`,
  };
}

// ---------------------------------------------------------------------------
// Stage 2.4 — HyperFrames runtime probe (for `montara doctor --fix`)
// ---------------------------------------------------------------------------

export interface HyperframesStatus {
  available: boolean;
  version: string | null;
  /** how the probe resolved: local node_modules, npx, or absent */
  source: "node_modules" | "npx" | "absent";
  hint: string;
}

/** node_modules/hyperframes present anywhere up the tree. */
function findHyperframesRoot(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "node_modules", "hyperframes")) || existsSync(join(dir, "node_modules", "@hyperframes", "cli"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Resolving the CLI costs an `npx` spawn of a few seconds, and the probe is called from both the
// status shape and the boolean wrapper. Left uncached, two calls a moment apart can disagree — on a
// loaded machine one spawn returns inside the timeout and the next does not, so the same toolchain
// reads as present and absent in the same run. Memoising makes the answer a property of the machine
// rather than of how busy it was when you asked.
const hyperframesProbeCache = new Map<string, HyperframesStatus>();

/** Forget the cached probe — call after installing or removing the CLI within a process. */
export function resetHyperframesProbe(): void {
  hyperframesProbeCache.clear();
}

/** Honest, never-throwing probe of the HyperFrames toolchain (Stage 2.4). Cached per start path. */
export function probeHyperframes(start: string = process.cwd()): HyperframesStatus {
  const cached = hyperframesProbeCache.get(start);
  if (cached) return cached;

  const status = ((): HyperframesStatus => {
    if (findHyperframesRoot(start)) {
      return { available: true, version: null, source: "node_modules", hint: "HyperFrames found in node_modules; run `npx hyperframes doctor` for details." };
    }
    try {
      const probe = spawnSync("npx", ["--no-install", "hyperframes", "--version"], { encoding: "utf8", shell: true, timeout: 8000 });
      if (probe.status === 0) {
        const version = (probe.stdout || "").trim().split(/\s+/)[0] || null;
        return { available: true, version, source: "npx", hint: "HyperFrames CLI resolved via npx." };
      }
    } catch { /* probe failure = not available */ }
    return { available: false, version: null, source: "absent", hint: "HyperFrames not installed; run `npx --yes hyperframes doctor` to verify and cache-warm before native kinetic renders." };
  })();

  hyperframesProbeCache.set(start, status);
  return status;
}

/** Boolean convenience wrapper around {@link probeHyperframes}. */
export function hyperframesAvailable(start: string = process.cwd()): boolean {
  return probeHyperframes(start).available;
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
  /**
   * Wall-clock render cost in milliseconds.
   *
   * Knowing *which* renderer ran explains a render; knowing what it cost lets you plan one — the
   * same engine can be seconds or minutes per scene depending on the scene type. Feed this to a
   * `RenderTimingLedger` to build a per-(renderer, scene type) profile.
   */
  renderMs: number;
}

/** Pick the best installed renderer for the scene type and actually render a real clip. */
export function autoRenderScene(req: AutoSceneRequest): AutoSceneResult {
  const startedAt = Date.now();
  const rec = recommendEngine(req.sceneType);
  const width = req.width ?? 1280, height = req.height ?? 720, fps = req.fps ?? 24, seconds = req.seconds ?? 1.5;

  const elapsed = (): number => Date.now() - startedAt;

  if (rec.engine === "three") {
    const r = renderThreeScene(req.outPath, { width, height, fps, seconds, title: req.title, background: req.background });
    return { ok: r.ok, engine: "three", native: true, path: r.path, frames: r.frames, error: r.error, renderMs: elapsed() };
  }
  if (rec.engine === "blender") {
    const script = req.blenderScript ?? join(process.cwd(), "blender", "montara_intro.py");
    const r = renderBlenderScene(script, req.outPath, { fps });
    return { ok: r.ok, engine: "blender", native: true, path: r.path ?? req.outPath, frames: r.frames, error: r.error, renderMs: elapsed() };
  }
  if (rec.engine === "manim") {
    const r = renderManimScene(req.outPath, { quality: "l" });
    return { ok: r.ok, engine: "manim", native: true, path: r.path, error: r.error, renderMs: elapsed() };
  }
  // ffmpeg fallback: a single titled scene
  try {
    renderScenePlan({ width, height, fps, scenes: [{ id: "auto", title: req.title ?? "", durationSec: seconds, background: req.background ?? "0a0a0a" }] }, req.outPath);
    return { ok: true, engine: "ffmpeg", native: false, path: req.outPath, renderMs: elapsed() };
  } catch (e) {
    return { ok: false, engine: "ffmpeg", native: false, path: req.outPath, error: String((e as Error).message ?? e), renderMs: elapsed() };
  }
}
