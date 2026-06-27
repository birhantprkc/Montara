// @montara/engine — render bridge.
// Routes a bridged composition to pixels two ways: the engine's own Remotion composer
// (stronger, what the demo renders) when it is installed and requested, and Montara's
// always-available FFmpeg path as the universal fallback. A run never hard-fails: if the
// engine composer is missing or errors, it degrades to ffmpeg on the same Timeline IR.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderTimeline } from "../../render-ffmpeg/src/index";
import { engineComposition, engineRoot, findPython } from "./index";
import { engineCompositionToTimeline } from "./timeline";

export type RenderEngineChoice = "ffmpeg" | "remotion";

export interface RenderBridgeResult {
  ok: boolean;
  path: string | null;
  engine: RenderEngineChoice;
  fellBack: boolean;
  error?: string;
}

/** Whether the engine's Remotion composer is installed (node_modules present). */
export function engineRemotionAvailable(root: string = engineRoot()): boolean {
  return existsSync(join(root, "remotion-composer", "node_modules"));
}

/** FFmpeg path: engine composition -> Timeline IR -> renderTimeline. Fast, always available. */
export function renderBridgedTimeline(name: string, outPath: string, root: string = engineRoot()): RenderBridgeResult {
  const comp = engineComposition(name, root);
  if (!comp) return { ok: false, path: null, engine: "ffmpeg", fellBack: false, error: `composition not found: ${name}` };
  const timeline = engineCompositionToTimeline(comp);
  mkdirSync(dirname(outPath), { recursive: true });
  const path = renderTimeline(timeline, outPath);
  return { ok: existsSync(path), path, engine: "ffmpeg", fellBack: false };
}

/** Remotion path: run the engine's own composer (strong, slow). Null result if unavailable/failed. */
export function renderViaEngineComposer(name: string, outPath: string, root: string = engineRoot()): RenderBridgeResult {
  const py = findPython();
  if (!py) return { ok: false, path: null, engine: "remotion", fellBack: false, error: "Python 3 not found" };
  if (!engineRemotionAvailable(root)) {
    return { ok: false, path: null, engine: "remotion", fellBack: false, error: "remotion composer not installed" };
  }
  const r = spawnSync(py, [join(root, "render_demo.py"), name], { cwd: root, encoding: "utf8" });
  const produced = join(root, "projects", "demos", "renders", `${name}.mp4`);
  if (r.status !== 0 || !existsSync(produced)) {
    return { ok: false, path: null, engine: "remotion", fellBack: false, error: (r.stderr || "engine render failed").slice(0, 200) };
  }
  mkdirSync(dirname(outPath), { recursive: true });
  copyFileSync(produced, outPath);
  return { ok: existsSync(outPath), path: outPath, engine: "remotion", fellBack: false };
}

/** Render bridge: prefer the engine composer when available + requested; fall back to ffmpeg. */
export function renderBridged(
  name: string,
  outPath: string,
  opts: { preferEngine?: boolean; root?: string } = {},
): RenderBridgeResult {
  const root = opts.root ?? engineRoot();
  if (opts.preferEngine && engineRemotionAvailable(root)) {
    const viaEngine = renderViaEngineComposer(name, outPath, root);
    if (viaEngine.ok) return viaEngine;
    return { ...renderBridgedTimeline(name, outPath, root), fellBack: true };
  }
  return renderBridgedTimeline(name, outPath, root);
}
