// @montara/quality — scored provider selection (Intelligence §H).
// 7-dimension weighted score: task-fit 30 / quality 20 / control 15 / reliability 15 /
// cost 10 / latency 5 / continuity 5 (sums to 100). Deterministic and fully explainable.

import type { ProviderToolDefinition, ToolCategory } from "../../providers/src/index";
import { DecisionTrail, clamp01 } from "./audit";

export interface ScoreDimensions {
  /** 0..1 — how well the candidate fits the task */
  taskFit: number;
  /** 0..1 — output quality ceiling */
  quality: number;
  /** 0..1 — directability / parameter control */
  control: number;
  /** 0..1 — how reliably it returns a usable result */
  reliability: number;
  /** 0..1 — 1 = cheapest/free */
  cost: number;
  /** 0..1 — 1 = fastest */
  latency: number;
  /** 0..1 — visual/voice continuity with the rest of the cut */
  continuity: number;
}

export const SELECTION_WEIGHTS: Record<keyof ScoreDimensions, number> = {
  taskFit: 30,
  quality: 20,
  control: 15,
  reliability: 15,
  cost: 10,
  latency: 5,
  continuity: 5,
};

export interface Candidate<T> {
  id: string;
  label: string;
  item: T;
  dims: ScoreDimensions;
}

export interface ScoredCandidate<T> extends Candidate<T> {
  /** 0..100 */
  score: number;
}

export interface SelectionResult<T> {
  chosen: ScoredCandidate<T>;
  ranked: ScoredCandidate<T>[];
  /** 0..1 — separation from the runner-up */
  confidence: number;
}

/** Weighted 0..100 score across the 7 dimensions. */
export function dimensionScore(dims: ScoreDimensions): number {
  let total = 0;
  (Object.keys(SELECTION_WEIGHTS) as (keyof ScoreDimensions)[]).forEach((k) => {
    total += clamp01(dims[k]) * SELECTION_WEIGHTS[k];
  });
  return Math.round(total * 100) / 100;
}

export function selectBest<T>(
  candidates: Candidate<T>[],
  opts: { trail?: DecisionTrail; kind?: string } = {},
): SelectionResult<T> {
  if (!candidates.length) throw new Error("selectBest requires at least one candidate");
  const ranked: ScoredCandidate<T>[] = candidates
    .map((c) => ({ ...c, score: dimensionScore(c.dims) }))
    .sort((a, b) => b.score - a.score);
  const chosen = ranked[0]!;
  const runnerUp = ranked[1];
  const gap = runnerUp ? (chosen.score - runnerUp.score) / 100 : 0.5;
  const confidence = clamp01(0.5 + gap);
  opts.trail?.record({
    kind: opts.kind ?? "provider-selection",
    chosen: `${chosen.label} (${chosen.score})`,
    confidence,
    rationale: `7-dim weighted score; beat ${ranked.length - 1} alternative(s)`,
    alternatives: ranked.slice(1).map((r) => ({ label: r.label, score: r.score })),
  });
  return { chosen, ranked, confidence };
}

/**
 * Derive selection dimensions for a provider tool given the task category. Local-free tools score
 * high on cost/reliability/control (offline, deterministic) and modest on quality (fallback output);
 * cloud tools invert that trade. Category mismatch tanks task-fit.
 */
export function toolDimensions(tool: ProviderToolDefinition, taskCategory: ToolCategory): ScoreDimensions {
  const fit = tool.category === taskCategory ? 1 : 0.15;
  const local = tool.tier === "local-free";
  return {
    taskFit: fit,
    quality: local ? 0.45 : 0.85,
    control: local ? 0.9 : 0.6,
    reliability: local ? 0.95 : 0.7,
    cost: local ? 1 : 0.3,
    latency: local ? 0.9 : 0.5,
    continuity: 0.6,
  };
}

export function selectProviderTool(
  tools: ProviderToolDefinition[],
  taskCategory: ToolCategory,
  opts: { trail?: DecisionTrail } = {},
): SelectionResult<ProviderToolDefinition> {
  const candidates: Candidate<ProviderToolDefinition>[] = tools.map((t) => ({
    id: t.id,
    label: t.name,
    item: t,
    dims: toolDimensions(t, taskCategory),
  }));
  return selectBest(candidates, { trail: opts.trail, kind: `provider-selection:${taskCategory}` });
}
