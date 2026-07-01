// @montara/render-remotion - Remotion composition adapter.
// It builds the renderer-neutral Timeline IR that a Remotion scene tree consumes
// and can route that IR through the native Remotion composer when explicitly
// enabled and installed. FFmpeg remains the universal fallback.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Clip, MediaClip, ScenePlan, SolidClip, TextClip, Timeline } from "../../core/src/index";
import { isMediaClip, scenePlanToTimeline, timelineDuration, validateTimeline } from "../../core/src/index";
import { renderTimeline } from "../../render-ffmpeg/src/index";

export interface ComposeResult {
  timeline: Timeline;
  composer: "remotion-ir";
  renderer: "remotion-native" | "ffmpeg-fallback";
  diagnostics: string[];
}

export function composeScenePlan(plan: ScenePlan): ComposeResult {
  const timeline = scenePlanToTimeline(plan);
  return {
    timeline,
    composer: "remotion-ir",
    renderer: remotionDefaultEnabled() && remotionNativeAvailable() ? "remotion-native" : "ffmpeg-fallback",
    diagnostics: validateTimeline(timeline),
  };
}

export interface RemotionRenderOptions {
  root?: string;
  preferNative?: boolean;
  requireNative?: boolean;
  env?: Record<string, string | undefined>;
}

export interface RemotionTimelineRenderResult {
  ok: boolean;
  path: string;
  renderer: "remotion-native" | "ffmpeg-fallback";
  native: boolean;
  composition: "Explainer";
  error?: string;
  fallbackReason?: string;
}

interface RemotionCut {
  id: string;
  in_seconds: number;
  out_seconds: number;
  source?: string;
  source_in_seconds?: number;
  type?: string;
  text?: string;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
}

interface RemotionOverlay {
  type: "hero_title" | "section_title";
  in_seconds: number;
  out_seconds: number;
  text: string;
  accentColor?: string;
}

export interface RemotionTimelineProps {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  cuts: RemotionCut[];
  overlays: RemotionOverlay[];
  captions: unknown[];
  audio: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function remotionDefaultEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.REMOTION_ENABLED ?? "");
}

function hexColor(color: string | undefined, fallback = "0a0a0a"): string {
  const clean = (color ?? fallback).replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean}` : `#${fallback}`;
}

function isSolidClip(clip: Clip): clip is SolidClip {
  return clip.type === "video" && "source" in clip && clip.source.kind === "solid";
}

function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

function textColor(clip: TextClip): string | undefined {
  return clip.style?.color ? hexColor(clip.style.color, "ffffff") : undefined;
}

function solidToCut(clip: SolidClip, text?: TextClip): RemotionCut {
  return {
    id: clip.id,
    in_seconds: clip.startSec,
    out_seconds: clip.startSec + clip.durationSec,
    type: "text_card",
    text: text?.text || clip.label || clip.id,
    backgroundColor: hexColor(clip.source.color),
    color: text ? textColor(text) : "#ffffff",
    fontSize: text?.style?.fontSize,
  };
}

function mediaToCut(clip: MediaClip): RemotionCut {
  return {
    id: clip.id,
    in_seconds: clip.startSec,
    out_seconds: clip.startSec + clip.durationSec,
    source: clip.source.path,
    source_in_seconds: clip.sourceInSec ?? 0,
  };
}

function textToOverlay(clip: TextClip): RemotionOverlay {
  return {
    type: "hero_title",
    in_seconds: clip.startSec,
    out_seconds: clip.startSec + clip.durationSec,
    text: clip.text,
    accentColor: textColor(clip),
  };
}

export function timelineToRemotionProps(timeline: Timeline): RemotionTimelineProps {
  const textClips = timeline.tracks
    .filter((track) => track.type === "text")
    .flatMap((track) => track.clips as TextClip[])
    .sort((a, b) => a.startSec - b.startSec);
  const consumedText = new Set<string>();
  const videoClips = timeline.tracks
    .filter((track) => track.type === "video")
    .flatMap((track) => track.clips)
    .sort((a, b) => a.startSec - b.startSec || (a.z ?? 0) - (b.z ?? 0));

  const cuts: RemotionCut[] = [];
  for (const clip of videoClips) {
    if (isSolidClip(clip)) {
      const text = textClips.find((candidate) => !consumedText.has(candidate.id) && overlaps(clip.startSec, clip.durationSec, candidate.startSec, candidate.durationSec));
      if (text) consumedText.add(text.id);
      cuts.push(solidToCut(clip, text));
    } else if (isMediaClip(clip)) {
      cuts.push(mediaToCut(clip));
    }
  }

  for (const text of textClips) {
    if (!consumedText.has(text.id) && !cuts.some((cut) => overlaps(cut.in_seconds, cut.out_seconds - cut.in_seconds, text.startSec, text.durationSec))) {
      cuts.push({
        id: text.id,
        in_seconds: text.startSec,
        out_seconds: text.startSec + text.durationSec,
        type: "text_card",
        text: text.text,
        backgroundColor: hexColor(timeline.composition.background),
        color: textColor(text),
        fontSize: text.style?.fontSize,
      });
      consumedText.add(text.id);
    }
  }

  if (!cuts.length) {
    cuts.push({
      id: "timeline-fallback",
      in_seconds: 0,
      out_seconds: timelineDuration(timeline),
      type: "text_card",
      text: "Montara Timeline",
      backgroundColor: hexColor(timeline.composition.background),
      color: "#ffffff",
    });
  }

  return {
    width: timeline.composition.width,
    height: timeline.composition.height,
    fps: timeline.composition.fps,
    durationSec: timelineDuration(timeline),
    cuts: cuts.sort((a, b) => a.in_seconds - b.in_seconds),
    overlays: textClips.filter((clip) => !consumedText.has(clip.id)).map(textToOverlay),
    captions: [],
    audio: {},
    metadata: {
      source: "timeline-ir",
      ...(timeline.metadata ?? {}),
    },
  };
}

function remotionRenderArgs(entry: string, composition: string, outPath: string, propsPath?: string): string[] {
  const args = [
    "render",
    entry,
    composition,
    outPath,
    "--overwrite",
    "--codec=h264",
    "--pixel-format=yuv420p",
    "--log=error",
    "--bundle-cache=false",
  ];
  if (propsPath) args.push(`--props=${propsPath}`);
  return args;
}

function clearRemotionCache(root: string): void {
  const cacheRoot = join(root, "node_modules", ".cache", "webpack");
  try {
    if (existsSync(cacheRoot) && resolve(cacheRoot).startsWith(resolve(root))) {
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  } catch {
    // Remotion can leave locked webpack cache packfiles on Windows; disabling the
    // cache below prevents new ones from being required for this render.
  }
}

export function renderNativeRemotionTimeline(timeline: Timeline, outPath: string, root: string = remotionComposerRoot()): RemotionTimelineRenderResult {
  const issues = validateTimeline(timeline);
  const absOut = resolve(outPath);
  if (issues.length) return { ok: false, path: absOut, renderer: "remotion-native", native: true, composition: "Explainer", error: `invalid timeline: ${issues.join("; ")}` };
  const cli = remotionCliCommand(root);
  const entry = join(root, "src", "index.tsx");
  if (!cli) return { ok: false, path: absOut, renderer: "remotion-native", native: true, composition: "Explainer", error: "Remotion CLI not installed in remotion-composer/node_modules" };
  if (!existsSync(entry)) return { ok: false, path: absOut, renderer: "remotion-native", native: true, composition: "Explainer", error: `Remotion entry not found: ${entry}` };

  mkdirSync(dirname(absOut), { recursive: true });
  const propsPath = join(dirname(absOut), ".remotion_timeline_props.json");
  writeFileSync(propsPath, `${JSON.stringify(timelineToRemotionProps(timeline), null, 2)}\n`);
  clearRemotionCache(root);
  const result = spawnSync(cli.command, [...cli.argsPrefix, ...remotionRenderArgs("src/index.tsx", "Explainer", absOut, propsPath)], {
    cwd: root,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 1 << 22,
    shell: cli.shell,
    env: {
      ...process.env,
      REMOTION_DISABLE_UPDATE_CHECK: "1",
    },
  });
  try { rmSync(propsPath, { force: true }); } catch { /* best effort */ }

  if (result.status !== 0 || !existsSync(absOut)) {
    return {
      ok: false,
      path: absOut,
      renderer: "remotion-native",
      native: true,
      composition: "Explainer",
      error: (result.error?.message || result.stderr || result.stdout || "Remotion Timeline render failed").slice(-1000),
    };
  }
  return { ok: true, path: absOut, renderer: "remotion-native", native: true, composition: "Explainer" };
}

export function renderComposedTimelineWithReport(timeline: Timeline, outPath: string, options: RemotionRenderOptions = {}): RemotionTimelineRenderResult {
  const issues = validateTimeline(timeline);
  const absOut = resolve(outPath);
  if (issues.length) return { ok: false, path: absOut, renderer: "ffmpeg-fallback", native: false, composition: "Explainer", error: `invalid timeline: ${issues.join("; ")}` };
  const root = options.root ?? remotionComposerRoot();
  const shouldTryNative = Boolean(options.preferNative || (remotionDefaultEnabled(options.env ?? process.env) && remotionNativeAvailable(root)));
  if (shouldTryNative) {
    const native = renderNativeRemotionTimeline(timeline, absOut, root);
    if (native.ok || options.requireNative) return native;
    renderTimeline(timeline, absOut);
    return { ok: true, path: absOut, renderer: "ffmpeg-fallback", native: false, composition: "Explainer", fallbackReason: native.error };
  }
  renderTimeline(timeline, absOut);
  return { ok: true, path: absOut, renderer: "ffmpeg-fallback", native: false, composition: "Explainer" };
}

export function renderComposedScenePlanWithReport(plan: ScenePlan, outPath: string, options: RemotionRenderOptions = {}): RemotionTimelineRenderResult {
  const result = composeScenePlan(plan);
  if (result.diagnostics.length) {
    return { ok: false, path: resolve(outPath), renderer: "ffmpeg-fallback", native: false, composition: "Explainer", error: `compose failed: ${result.diagnostics.join("; ")}` };
  }
  return renderComposedTimelineWithReport(result.timeline, outPath, options);
}

export function renderComposedScenePlan(plan: ScenePlan, outPath: string, options: RemotionRenderOptions = {}): string {
  const result = renderComposedScenePlanWithReport(plan, outPath, options);
  if (!result.ok) throw new Error(result.error ?? "Remotion scene plan render failed");
  return result.path;
}

export function renderComposedTimeline(timeline: Timeline, outPath: string, options: RemotionRenderOptions = {}): string {
  const result = renderComposedTimelineWithReport(timeline, outPath, options);
  if (!result.ok) throw new Error(result.error ?? "Remotion Timeline render failed");
  return result.path;
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

function remotionCliCommand(root: string = remotionComposerRoot()): { command: string; argsPrefix: string[]; shell: boolean } | null {
  const cliScript = join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");
  if (existsSync(cliScript)) return { command: process.argv[0] || "node", argsPrefix: [cliScript], shell: false };
  const bin = remotionCliBin(root);
  return bin ? { command: bin, argsPrefix: [], shell: process.platform === "win32" } : null;
}

export function remotionNativeAvailable(root: string = remotionComposerRoot()): boolean {
  return Boolean(
    remotionCliCommand(root) &&
      existsSync(join(root, "src", "native-smoke.tsx")) &&
      existsSync(join(root, "node_modules", "@remotion", "renderer")),
  );
}

export function renderNativeRemotionSmoke(outPath: string, root: string = remotionComposerRoot()): NativeRemotionResult {
  const cli = remotionCliCommand(root);
  const entry = join(root, "src", "native-smoke.tsx");
  const absOut = resolve(outPath);
  if (!cli) return { ok: false, path: absOut, renderer: "remotion-native", composition: "NativeSmoke", error: "Remotion CLI not installed in remotion-composer/node_modules" };
  if (!existsSync(entry)) return { ok: false, path: absOut, renderer: "remotion-native", composition: "NativeSmoke", error: `native smoke entry not found: ${entry}` };
  mkdirSync(dirname(absOut), { recursive: true });
  clearRemotionCache(root);
  const result = spawnSync(cli.command, [...cli.argsPrefix, ...remotionRenderArgs("src/native-smoke.tsx", "NativeSmoke", absOut)], {
    cwd: root,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 1 << 22,
    shell: cli.shell,
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
