// @montara/render-revideo — native Revideo adapter (MIT, license-safe Remotion alternative).
// Revideo is a Motion-Canvas-based programmatic video framework with a headless renderer. This
// adapter detects an installed @revideo toolchain and renders a project to MP4 via its CLI; when
// absent it reports unavailable so the auto-picker degrades to the ffmpeg compositor.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** node_modules/@revideo present anywhere up the tree, or the `revideo` CLI on PATH. */
function findRevideoRoot(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "node_modules", "@revideo", "core"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function revideoAvailable(start: string = process.cwd()): boolean {
  if (findRevideoRoot(start)) return true;
  return spawnSync("npx", ["--no-install", "revideo", "--version"], { encoding: "utf8", shell: true }).status === 0;
}

function newestMp4(root: string): string | null {
  const found: { path: string; mtime: number }[] = [];
  const walk = (dir: string): void => {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const p = join(dir, name);
      let s; try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else if (name.toLowerCase().endsWith(".mp4")) found.push({ path: p, mtime: s.mtimeMs });
    }
  };
  walk(root);
  found.sort((a, b) => b.mtime - a.mtime);
  return found.length ? found[0]!.path : null;
}

export interface RevideoRenderResult {
  ok: boolean;
  path: string;
  renderer: "revideo";
  error?: string;
}

/** Render a Revideo project directory to `outPath` via the Revideo renderer CLI. */
export function renderRevideoProject(projectDir: string, outPath: string): RevideoRenderResult {
  if (!revideoAvailable(projectDir)) return { ok: false, path: outPath, renderer: "revideo", error: "revideo not installed (npm i @revideo/core @revideo/cli)" };
  if (!existsSync(projectDir)) return { ok: false, path: outPath, renderer: "revideo", error: `project not found: ${projectDir}` };
  mkdirSync(dirname(outPath), { recursive: true });
  const r = spawnSync("npx", ["--no-install", "revideo", "render"], { cwd: projectDir, encoding: "utf8", shell: true, timeout: 240000 });
  const produced = newestMp4(join(projectDir, "output")) ?? newestMp4(projectDir);
  if (r.status !== 0 || !produced) return { ok: false, path: outPath, renderer: "revideo", error: (r.stderr || "revideo produced no mp4").slice(-400) };
  copyFileSync(produced, outPath);
  return { ok: existsSync(outPath), path: outPath, renderer: "revideo" };
}
