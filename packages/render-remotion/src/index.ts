// @montara/render-remotion - Remotion composition adapter.
// It builds the renderer-neutral Timeline IR that a Remotion scene tree would consume.
// It can also run a bounded native Remotion smoke render when the local composer
// toolchain is installed; general Timeline rendering still degrades to ffmpeg.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ScenePlan, Timeline } from "../../core/src/index";
import { scenePlanToTimeline, validateTimeline } from "../../core/src/index";
import { renderTimeline } from "../../render-ffmpeg/src/index";

export interface ComposeResult {
  timeline: Timeline;
  composer: "remotion-ir";
  renderer: "ffmpeg-fallback";
  diagnostics: string[];
}

export function composeScenePlan(plan: ScenePlan): ComposeResult {
  const timeline = scenePlanToTimeline(plan);
  return {
    timeline,
    composer: "remotion-ir",
    renderer: "ffmpeg-fallback",
    diagnostics: validateTimeline(timeline),
  };
}

export function renderComposedScenePlan(plan: ScenePlan, outPath: string): string {
  const result = composeScenePlan(plan);
  if (result.diagnostics.length) {
    throw new Error(`compose failed: ${result.diagnostics.join("; ")}`);
  }
  return renderTimeline(result.timeline, outPath);
}

export function renderComposedTimeline(timeline: Timeline, outPath: string): string {
  const issues = validateTimeline(timeline);
  if (issues.length) throw new Error(`compose failed: ${issues.join("; ")}`);
  return renderTimeline(timeline, outPath);
}

export interface NativeRemotionResult {
  ok: boolean;
  path: string;
  renderer: "remotion-native";
  composition: string;
  error?: string;
}

export function remotionComposerRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "remotion-composer");
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "remotion-composer");
}

export function remotionCliBin(root: string = remotionComposerRoot()): string | null {
  const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "remotion.cmd" : "remotion");
  return existsSync(bin) ? bin : null;
}

export function remotionNativeAvailable(root: string = remotionComposerRoot()): boolean {
  return Boolean(
    remotionCliBin(root) &&
      existsSync(join(root, "src", "native-smoke.tsx")) &&
      existsSync(join(root, "node_modules", "@remotion", "renderer")),
  );
}

export function renderNativeRemotionSmoke(outPath: string, root: string = remotionComposerRoot()): NativeRemotionResult {
  const bin = remotionCliBin(root);
  const entry = join(root, "src", "native-smoke.tsx");
  const absOut = resolve(outPath);
  if (!bin) return { ok: false, path: absOut, renderer: "remotion-native", composition: "NativeSmoke", error: "Remotion CLI not installed in remotion-composer/node_modules" };
  if (!existsSync(entry)) return { ok: false, path: absOut, renderer: "remotion-native", composition: "NativeSmoke", error: `native smoke entry not found: ${entry}` };
  mkdirSync(dirname(absOut), { recursive: true });
  const cacheRoot = join(root, "node_modules", ".cache", "webpack");
  try {
    if (existsSync(cacheRoot) && resolve(cacheRoot).startsWith(resolve(root))) {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  } catch {
    // Remotion can leave locked webpack cache packfiles on Windows; disabling the
    // cache below prevents new ones from being required for this smoke render.
  }
  const result = spawnSync(bin, [
    "render",
    "src/native-smoke.tsx",
    "NativeSmoke",
    absOut,
    "--overwrite",
    "--codec=h264",
    "--pixel-format=yuv420p",
    "--log=error",
    "--bundle-cache=false",
  ], {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 1 << 22,
    shell: process.platform === "win32",
    env: {
      ...process.env,
      REMOTION_DISABLE_UPDATE_CHECK: "1",
    },
  });
  if (result.status !== 0 || !existsSync(absOut)) {
    return {
      ok: false,
      path: absOut,
      renderer: "remotion-native",
      composition: "NativeSmoke",
      error: (result.error?.message || result.stderr || result.stdout || "Remotion render failed").slice(-1000),
    };
  }
  return { ok: true, path: absOut, renderer: "remotion-native", composition: "NativeSmoke" };
}
