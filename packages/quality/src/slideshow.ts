// @montara/quality — slideshow-risk scoring (Quality governance §I).
// Flags "animated PowerPoint": static holds, no motion, no audio bed, too few cuts. Higher = worse.

import type { Timeline, Clip } from "../../core/src/index";
import { clamp01 } from "./audit";

export type RiskLevel = "low" | "medium" | "high";

export interface SlideshowRisk {
  /** 0..1 — higher means more slideshow-like */
  score: number;
  level: RiskLevel;
  reasons: string[];
}

function hasMotion(clip: Clip): boolean {
  const kf = clip.keyframes && Object.keys(clip.keyframes).length > 0;
  const tIn = clip.transitionIn && clip.transitionIn.kind !== "cut";
  const tOut = clip.transitionOut && clip.transitionOut.kind !== "cut";
  return Boolean(kf || tIn || tOut);
}

export function slideshowRisk(timeline: Timeline): SlideshowRisk {
  const reasons: string[] = [];
  const allClips = timeline.tracks.flatMap((t) => t.clips);
  const visual = allClips.filter((c) => c.type === "video" || c.type === "text");
  const hasAudio = timeline.tracks.some((t) => t.type === "audio" && t.clips.length > 0);

  let score = 0;

  // 1. fraction of visuals with no motion/transition
  const staticCount = visual.filter((c) => !hasMotion(c)).length;
  const staticFrac = visual.length ? staticCount / visual.length : 1;
  score += staticFrac * 0.45;
  if (staticFrac >= 0.8) reasons.push(`${Math.round(staticFrac * 100)}% of visuals have no motion or transitions`);

  // 2. long static holds (>5s with nothing moving)
  const longHolds = visual.filter((c) => !hasMotion(c) && c.durationSec > 5).length;
  if (longHolds > 0) {
    score += clamp01(longHolds / Math.max(1, visual.length)) * 0.2;
    reasons.push(`${longHolds} static hold(s) longer than 5s`);
  }

  // 3. no audio bed at all
  if (!hasAudio) {
    score += 0.2;
    reasons.push("no audio track (silent slideshow)");
  }

  // 4. too few cuts for the runtime (avg scene > 6s)
  const sceneCount = timeline.tracks.find((t) => t.type === "video")?.clips.length ?? 0;
  const avgScene = sceneCount ? timeline.composition.durationSec / sceneCount : timeline.composition.durationSec;
  if (avgScene > 6) {
    score += 0.15;
    reasons.push(`average scene length ${avgScene.toFixed(1)}s is long`);
  }

  score = clamp01(score);
  const level: RiskLevel = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
  if (!reasons.length) reasons.push("motion, transitions and audio present");
  return { score: Math.round(score * 1000) / 1000, level, reasons };
}
