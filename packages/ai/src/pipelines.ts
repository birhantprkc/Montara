// @montara/ai — pipeline stage directors (Phase 1.2).
// Each pipeline is a "shape": an ordered set of beats with relative weights and a palette.
// A deterministic planner distributes the target runtime across the beats and titles each
// scene — producing a structured ScenePlan with ZERO model calls (Stage 1 is readable-system;
// a brain enriches these titles later). The shapes are Montara's own implementation.

import { round3, type Scene, type ScenePlan } from "../../core/src/index";

export interface PipelineBeat {
  /** Scene label used as the title for non-opening beats. */
  label: string;
  /** Relative share of the total runtime. */
  weight: number;
}

export interface PipelineDef {
  id: string;
  name: string;
  blurb: string;
  /** Hex colors without '#', cycled across scenes. */
  palette: string[];
  beats: PipelineBeat[];
}

export interface PlanOptions {
  targetSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
}

// ---- the 12 pipeline shapes ------------------------------------------------

export const PIPELINE_DEFS: PipelineDef[] = [
  {
    id: "animated-explainer",
    name: "Animated Explainer",
    blurb: "Teach one idea clearly: hook → why → how → example → takeaway.",
    palette: ["101820", "16323a", "1f4d4a", "2a6f5f", "0f3d2e"],
    beats: [
      { label: "Hook", weight: 1.0 },
      { label: "Why it matters", weight: 1.2 },
      { label: "How it works", weight: 1.6 },
      { label: "In practice", weight: 1.2 },
      { label: "The takeaway", weight: 1.0 },
    ],
  },
  {
    id: "animation",
    name: "Animation / Motion Graphics",
    blurb: "Punchy kinetic beats for social and product demos.",
    palette: ["0a0a0a", "1a1030", "2b0f45", "3d1153", "120a24"],
    beats: [
      { label: "Title in", weight: 1.0 },
      { label: "Idea", weight: 1.3 },
      { label: "Detail", weight: 1.3 },
      { label: "Payoff", weight: 1.0 },
    ],
  },
  {
    id: "avatar-spokesperson",
    name: "Avatar Spokesperson",
    blurb: "Presenter-framed message: intro → message → proof → CTA.",
    palette: ["12161c", "1c2530", "243140", "2d3c4f"],
    beats: [
      { label: "Intro", weight: 1.0 },
      { label: "Message", weight: 1.6 },
      { label: "Proof", weight: 1.2 },
      { label: "Call to action", weight: 1.0 },
    ],
  },
  {
    id: "cinematic",
    name: "Cinematic / Trailer",
    blurb: "Mood-driven beats: open → build → reveal → resolve.",
    palette: ["050608", "0d1117", "161b22", "23120f", "3a0d0d"],
    beats: [
      { label: "Cold open", weight: 1.0 },
      { label: "The build", weight: 1.4 },
      { label: "The reveal", weight: 1.4 },
      { label: "Resolve", weight: 1.0 },
    ],
  },
  {
    id: "clip-factory",
    name: "Clip Factory",
    blurb: "One self-contained short: hook -> payoff -> next action.",
    palette: ["0a0a0a", "1d1d1d", "2a1240"],
    beats: [
      { label: "Hook", weight: 1.0 },
      { label: "Payoff", weight: 1.4 },
      { label: "Next action", weight: 0.8 },
    ],
  },
  {
    id: "documentary-montage",
    name: "Documentary Montage",
    blurb: "Narrated montage: cold-open → context → evidence → implication → close.",
    palette: ["07090c", "12181f", "1b2530", "26170f", "0e1d16"],
    beats: [
      { label: "Cold open", weight: 1.0 },
      { label: "Context", weight: 1.3 },
      { label: "Evidence", weight: 1.5 },
      { label: "What it means", weight: 1.3 },
      { label: "Close", weight: 1.0 },
    ],
  },
  {
    id: "hybrid",
    name: "Hybrid",
    blurb: "Source footage + AI support visuals, alternating.",
    palette: ["0a0f0a", "13241a", "1f3a2a", "294f38"],
    beats: [
      { label: "Open", weight: 1.0 },
      { label: "Footage", weight: 1.4 },
      { label: "Support visual", weight: 1.2 },
      { label: "Close", weight: 1.0 },
    ],
  },
  {
    id: "localization-dub",
    name: "Localization & Dub",
    blurb: "Restructure an existing piece for another language (caption/dub beats).",
    palette: ["0a0a14", "151528", "20203c", "2b2b50"],
    beats: [
      { label: "Source segment", weight: 1.4 },
      { label: "Translated caption", weight: 1.4 },
      { label: "Dub note", weight: 1.0 },
    ],
  },
  {
    id: "podcast-repurpose",
    name: "Podcast Repurpose",
    blurb: "Highlight reel: hook quote → context → punch → CTA.",
    palette: ["120a0a", "241313", "3a1d1d", "4f2727"],
    beats: [
      { label: "Hook quote", weight: 1.0 },
      { label: "Context", weight: 1.2 },
      { label: "The punch", weight: 1.4 },
      { label: "Full episode", weight: 0.8 },
    ],
  },
  {
    id: "screen-demo",
    name: "Screen Demo",
    blurb: "Walkthrough: intro → step 1 → step 2 → step 3 → recap.",
    palette: ["0a0e12", "121821", "1b2430", "243140", "0e1d16"],
    beats: [
      { label: "Intro", weight: 1.0 },
      { label: "Step 1", weight: 1.2 },
      { label: "Step 2", weight: 1.2 },
      { label: "Step 3", weight: 1.2 },
      { label: "Recap", weight: 1.0 },
    ],
  },
  {
    id: "talking-head",
    name: "Talking Head + Overlays",
    blurb: "Footage-led speaker: intro → point 1 → point 2 → outro.",
    palette: ["0c0c0e", "17171c", "21212a", "2b2b38"],
    beats: [
      { label: "Intro", weight: 1.0 },
      { label: "Point one", weight: 1.3 },
      { label: "Point two", weight: 1.3 },
      { label: "Outro", weight: 1.0 },
    ],
  },
  {
    id: "kinetic-typography",
    name: "Kinetic Typography",
    blurb: "Words are the visual — animated text to a beat.",
    palette: ["0a0a0a", "e23636", "0a0a0a", "9fd8ff", "0a0a0a"],
    beats: [
      { label: "Line one", weight: 1.0 },
      { label: "Line two", weight: 1.0 },
      { label: "Line three", weight: 1.0 },
      { label: "Land it", weight: 1.2 },
    ],
  },
];

export const PIPELINES: Map<string, PipelineDef> = new Map(PIPELINE_DEFS.map((d) => [d.id, d]));

export function listPipelines(): PipelineDef[] {
  return PIPELINE_DEFS;
}

export function getPipeline(id: string): PipelineDef | undefined {
  return PIPELINES.get(id);
}

/** Distribute the target runtime across a pipeline's beats → a structured ScenePlan. */
export function planFromDefinition(def: PipelineDef, idea: string, opts: PlanOptions = {}): ScenePlan {
  const target = Math.max(4, opts.targetSeconds ?? 20);
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fps = opts.fps ?? 30;
  const totalWeight = def.beats.reduce((s, b) => s + b.weight, 0) || 1;
  const cleanIdea = idea.trim() || def.name;

  const scenes: Scene[] = def.beats.map((beat, i) => ({
    id: `${def.id}-${i + 1}`,
    title: i === 0 ? cleanIdea.slice(0, 64) : beat.label,
    durationSec: Math.max(0.6, round3((beat.weight / totalWeight) * target)),
    background: def.palette[i % def.palette.length] ?? "0a0a0a",
  }));

  return { width, height, fps, scenes };
}

/** Plan a video for a named pipeline. Throws on an unknown id (with the known list). */
export function planVideo(pipelineId: string, idea: string, opts: PlanOptions = {}): ScenePlan {
  const def = PIPELINES.get(pipelineId);
  if (!def) {
    throw new Error(`unknown pipeline "${pipelineId}". known: ${[...PIPELINES.keys()].join(", ")}`);
  }
  return planFromDefinition(def, idea, opts);
}
