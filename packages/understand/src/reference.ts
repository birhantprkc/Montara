// @montara/understand — reference-video analysis (§G).
// Probes a reference clip, detects its pacing, understands its look, then proposes 2–3
// differentiated concepts plus a rough cost estimate — the "paste a video, get variants" flow.

import { probeMediaInfo } from "./probe";
import { detectScenes } from "./scenes";
import { understandVideo, type VideoUnderstanding } from "./video";

export interface VideoConcept {
  id: string;
  angle: string;
  rationale: string;
}

export interface ReferenceNeed {
  id: string;
  need: string;
  evidence: string;
  recommendedSkill: string;
  fallback: string;
}

export interface ReferenceAnalysis {
  durationSec: number;
  width: number;
  height: number;
  sceneCount: number;
  cutsPerMinute: number;
  understanding: VideoUnderstanding;
  referenceNeeds: ReferenceNeed[];
  concepts: VideoConcept[];
  costEstimateUsd: number;
}

function referenceNeeds(understanding: VideoUnderstanding, cutsPerMinute: number): ReferenceNeed[] {
  const needs: ReferenceNeed[] = [];
  const shots = understanding.aspectBreakdown;
  if (shots.some((shot) => shot.motionType === "motion_clip") || cutsPerMinute > 12) {
    needs.push({
      id: "motion-rhythm",
      need: "match the reference's motion rhythm with real motion or animation, not static cards",
      evidence: `${cutsPerMinute} cuts/min; motion types: ${[...new Set(shots.map((shot) => shot.motionType))].join(", ") || "unknown"}`,
      recommendedSkill: ".agents/skills/hyperframes/SKILL.md",
      fallback: "Timeline IR beats with explicit source-motion clips and caption-only overlays",
    });
  }
  if (understanding.tags.includes("speech-capable")) {
    needs.push({
      id: "speech-led-edit",
      need: "align cuts, captions, and overlays to transcript timing",
      evidence: "source has audio; verify cut points against transcription before Shorts/reels",
      recommendedSkill: "skills/editing/reel.md",
      fallback: "keep original audio and use only source-derived caption cues",
    });
  }
  if (understanding.tags.includes("horizontal") || understanding.tags.includes("vertical")) {
    needs.push({
      id: "framing-safe-zones",
      need: "preserve the source framing while placing overlays in safe zones",
      evidence: shots.map((shot) => `${shot.shotId}: ${shot.spatialFraming}`).join("; "),
      recommendedSkill: "skills/editing/layers-and-tracks.md",
      fallback: "center-safe text clips with no subject segmentation claims",
    });
  }
  return needs;
}

export function analyzeReferenceVideo(
  inputPath: string,
  opts: { conceptCount?: number; perSecondUsd?: number } = {},
): ReferenceAnalysis {
  const info = probeMediaInfo(inputPath);
  const scenes = detectScenes(inputPath);
  const understanding = understandVideo(inputPath, { maxFrames: 5 });
  const cutsPerMinute = info.durationSec > 0 ? Math.round((scenes.cuts.length / info.durationSec) * 600) / 10 : 0;
  const tone = understanding.tags[0] ?? "neutral";

  const seeds: VideoConcept[] = [
    { id: "faithful", angle: "a tighter recut of the same material", rationale: `matches the source pacing (${cutsPerMinute} cuts/min)` },
    { id: "contrast", angle: `flip the ${tone} tone for contrast`, rationale: "differentiate on look from the reference" },
    { id: "data", angle: "a data-forward version with on-screen stats", rationale: "add the layer the reference lacks" },
  ];
  const n = Math.min(3, Math.max(2, opts.conceptCount ?? 3));
  const concepts = seeds.slice(0, n);
  const needs = referenceNeeds(understanding, cutsPerMinute);

  const rate = opts.perSecondUsd ?? 0.05;
  const costEstimateUsd = Math.round(info.durationSec * rate * n * 100) / 100;

  return {
    durationSec: info.durationSec,
    width: info.width,
    height: info.height,
    sceneCount: scenes.sceneCount,
    cutsPerMinute,
    understanding,
    referenceNeeds: needs,
    concepts,
    costEstimateUsd,
  };
}
