// @montara/render-motioncanvas — native Motion Canvas adapter (MIT, kinetic typography / motion gfx).
// Motion Canvas renders an image sequence from a project's scenes; this adapter detects an installed
// @motion-canvas toolchain and invokes its renderer, stitching to MP4 with ffmpeg. When the toolchain
// is absent it reports unavailable so the auto-picker degrades to the ffmpeg compositor.
//
// Note: headless Motion Canvas rendering is driven through its Vite project; the render-friendly
// path in this family is Revideo (see @montara/render-revideo), which the picker prefers when both
// are present.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

function findMotionCanvasRoot(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "node_modules", "@motion-canvas", "core"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function motionCanvasAvailable(start: string = process.cwd()): boolean {
  return findMotionCanvasRoot(start) !== null;
}

function newestMedia(root: string, exts: string[]): string | null {
  const found: { path: string; mtime: number }[] = [];
  const walk = (dir: string): void => {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const p = join(dir, name);
      let s; try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else if (exts.some((e) => name.toLowerCase().endsWith(e))) found.push({ path: p, mtime: s.mtimeMs });
    }
  };
  walk(root);
  found.sort((a, b) => b.mtime - a.mtime);
  return found.length ? found[0]!.path : null;
}

export interface MotionCanvasRenderResult {
  ok: boolean;
  path: string;
  renderer: "motion-canvas";
  error?: string;
}

/** Render a Motion Canvas project to `outPath` (project build + renderer). */
export function renderMotionCanvasProject(projectDir: string, outPath: string): MotionCanvasRenderResult {
  if (!motionCanvasAvailable(projectDir)) return { ok: false, path: outPath, renderer: "motion-canvas", error: "motion-canvas not installed (npm i @motion-canvas/core @motion-canvas/2d)" };
  if (!existsSync(projectDir)) return { ok: false, path: outPath, renderer: "motion-canvas", error: `project not found: ${projectDir}` };
  mkdirSync(dirname(outPath), { recursive: true });
  const r = spawnSync("npx", ["--no-install", "vite", "build"], { cwd: projectDir, encoding: "utf8", shell: true, timeout: 240000 });
  const produced = newestMedia(join(projectDir, "output"), [".mp4"]) ?? newestMedia(projectDir, [".mp4"]);
  if (r.status !== 0 || !produced) return { ok: false, path: outPath, renderer: "motion-canvas", error: (r.stderr || "no rendered mp4 found").slice(-400) };
  copyFileSync(produced, outPath);
  return { ok: existsSync(outPath), path: outPath, renderer: "motion-canvas" };
}
