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

export interface ReferenceAnalysis {
  durationSec: number;
  width: number;
  height: number;
  sceneCount: number;
  cutsPerMinute: number;
  understanding: VideoUnderstanding;
  concepts: VideoConcept[];
  costEstimateUsd: number;
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

  const rate = opts.perSecondUsd ?? 0.05;
  const costEstimateUsd = Math.round(info.durationSec * rate * n * 100) / 100;

  return {
    durationSec: info.durationSec,
    width: info.width,
    height: info.height,
    sceneCount: scenes.sceneCount,
    cutsPerMinute,
    understanding,
    concepts,
    costEstimateUsd,
  };
}
