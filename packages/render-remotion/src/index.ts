// @montara/render-remotion - Phase 1.1 composition adapter.
// It builds the renderer-neutral Timeline IR that a Remotion scene tree would consume.
// Until @remotion/renderer is installed/licensed, render() deliberately degrades to ffmpeg.

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
