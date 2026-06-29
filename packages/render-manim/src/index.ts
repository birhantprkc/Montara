// @montara/render-manim — REAL native Manim adapter (math / educational animation).
// Detects a Manim install (CLI or `python -m manim`), renders a scene to MP4, and copies the
// result to outPath. When Manim isn't installed it reports unavailable so the auto-picker degrades
// to the ffmpeg compositor — the render never hard-fails for a missing engine.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export type ManimInvocation = { bin: string; prefix: string[] };

/** How to invoke Manim on this machine: the `manim` CLI, or `python -m manim`, or null. */
export function manimInvocation(): ManimInvocation | null {
  const direct = spawnSync("manim", ["--version"], { encoding: "utf8", timeout: 5000 });
  if (direct.status === 0) return { bin: "manim", prefix: [] };
  for (const py of ["python", "python3", "py"]) {
    const r = spawnSync(py, ["-m", "manim", "--version"], { encoding: "utf8", timeout: 5000 });
    if (r.status === 0) return { bin: py, prefix: ["-m", "manim"] };
  }
  return null;
}

export function manimAvailable(): boolean {
  return manimInvocation() !== null;
}

/** A minimal default scene using Text + shapes only (Pango, no LaTeX dependency). */
function defaultScene(): string {
  return [
    "from manim import *",
    "",
    "class MontaraScene(Scene):",
    "    def construct(self):",
    "        title = Text('MONTARA', weight=BOLD).scale(1.2)",
    "        self.play(Write(title))",
    "        self.wait(0.3)",
    "        sub = Text('math · motion · montage', color=TEAL).scale(0.6).next_to(title, DOWN)",
    "        self.play(FadeIn(sub, shift=UP * 0.3))",
    "        circle = Circle(radius=1.7, color=YELLOW).shift(DOWN * 0.1)",
    "        square = Square(side_length=3.0, color=BLUE).shift(DOWN * 0.1)",
    "        self.play(Create(circle), run_time=0.7)",
    "        self.play(Transform(circle, square), run_time=0.8)",
    "        self.wait(0.4)",
    "",
  ].join("\n");
}

/** Newest .mp4 under a directory tree (Manim nests output under media/videos/.../). */
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

export interface ManimRenderResult {
  ok: boolean;
  path: string;
  renderer: "manim";
  scene: string;
  error?: string;
}

export interface ManimRenderOptions {
  /** Custom scene .py (defaults to the bundled MontaraScene). */
  scriptPath?: string;
  /** Scene class name inside the script. */
  sceneName?: string;
  /** Manim quality flag: l(ow)/m(edium)/h(igh). */
  quality?: "l" | "m" | "h";
}

/** Render a Manim scene to `outPath`. Real Manim invocation; copies the produced MP4 out. */
export function renderManimScene(outPath: string, opts: ManimRenderOptions = {}): ManimRenderResult {
  const inv = manimInvocation();
  const sceneName = opts.sceneName ?? "MontaraScene";
  if (!inv) return { ok: false, path: outPath, renderer: "manim", scene: sceneName, error: "manim not installed (pip install manim)" };

  const work = join(tmpdir(), `montara-manim-${Date.now().toString(36)}`);
  const media = join(work, "media");
  mkdirSync(media, { recursive: true });
  mkdirSync(dirname(outPath), { recursive: true });

  let script = opts.scriptPath;
  if (!script) { script = join(work, "scene.py"); writeFileSync(script, defaultScene()); }

  const q = opts.quality ?? "l";
  const r = spawnSync(inv.bin, [...inv.prefix, "render", `-q${q}`, "--format=mp4", "--media_dir", media, script, sceneName], { encoding: "utf8", timeout: 180000 });
  const produced = newestMp4(media);
  if (r.status !== 0 || !produced) {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    return { ok: false, path: outPath, renderer: "manim", scene: sceneName, error: (r.stderr || "manim produced no mp4").slice(-400) };
  }
  copyFileSync(produced, outPath);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  return { ok: existsSync(outPath), path: outPath, renderer: "manim", scene: sceneName };
}
