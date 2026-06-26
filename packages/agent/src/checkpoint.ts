// @montara/agent — resumable JSON checkpoints (§K).
// A run is a walk through the fixed pipeline stages; each completed stage (and its artifact) is
// persisted, so a crashed or paused run resumes from the next unfinished stage instead of restarting.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PIPELINE_STAGES = [
  "research",
  "plan",
  "script",
  "populate",
  "enrich",
  "render",
  "qa",
  "master",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface Checkpoint {
  version: 1;
  runId: string;
  idea: string;
  pipelineId: string;
  createdIso: string;
  updatedIso: string;
  completed: PipelineStage[];
  artifacts: Record<string, string>;
  done: boolean;
}

export function createCheckpoint(idea: string, pipelineId: string, runId?: string): Checkpoint {
  const now = new Date().toISOString();
  return {
    version: 1,
    runId: runId ?? `run-${Date.now().toString(36)}`,
    idea,
    pipelineId,
    createdIso: now,
    updatedIso: now,
    completed: [],
    artifacts: {},
    done: false,
  };
}

/** First stage not yet completed, or null when the run is finished. */
export function nextStage(cp: Checkpoint): PipelineStage | null {
  return PIPELINE_STAGES.find((s) => !cp.completed.includes(s)) ?? null;
}

export function isComplete(cp: Checkpoint): boolean {
  return PIPELINE_STAGES.every((s) => cp.completed.includes(s));
}

/** Mark a stage complete (idempotent), optionally recording its artifact path. Returns the new state. */
export function advanceCheckpoint(cp: Checkpoint, stage: PipelineStage, artifactPath?: string): Checkpoint {
  const completed = cp.completed.includes(stage) ? cp.completed : [...cp.completed, stage];
  const artifacts = artifactPath ? { ...cp.artifacts, [stage]: artifactPath } : { ...cp.artifacts };
  const next: Checkpoint = {
    ...cp,
    completed,
    artifacts,
    updatedIso: new Date().toISOString(),
    done: false,
  };
  next.done = isComplete(next);
  return next;
}

export function saveCheckpoint(cp: Checkpoint, path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cp, null, 2)}\n`);
  return path;
}

export function loadCheckpoint(path: string): Checkpoint {
  return JSON.parse(readFileSync(path, "utf8")) as Checkpoint;
}
