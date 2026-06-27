// Pipeline-stage checkpoint writer/reader with canonical artifact checks.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getStageOrder, loadPipeline } from "./pipelineLoader";

export const ALL_KNOWN_STAGES = new Set([
  "research", "proposal", "idea", "script", "scene_plan",
  "assets", "edit", "compose", "publish",
]);

export const STAGES = [
  "research", "proposal", "idea", "script", "scene_plan",
  "assets", "edit", "compose", "publish",
];

export const CANONICAL_STAGE_ARTIFACTS: Record<string, string> = {
  research: "research_brief",
  proposal: "proposal_packet",
  idea: "brief",
  script: "script",
  scene_plan: "scene_plan",
  assets: "asset_manifest",
  edit: "edit_decisions",
  compose: "render_report",
  publish: "publish_log",
};

export const SUPPLEMENTARY_ARTIFACTS = new Set([
  "source_media_review",
  "final_review",
  "video_analysis_brief",
]);

const ARTIFACT_NAMES = new Set([
  ...Object.values(CANONICAL_STAGE_ARTIFACTS),
  ...SUPPLEMENTARY_ARTIFACTS,
  "decision_log",
]);

export class CheckpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointValidationError";
  }
}

export interface PipelineCheckpoint {
  version: string;
  project_id: string;
  pipeline_type: string;
  stage: string;
  status: string;
  timestamp: string;
  checkpoint_policy: string;
  human_approval_required: boolean;
  human_approved: boolean;
  artifacts: Record<string, unknown>;
  style_playbook?: string;
  review?: Record<string, unknown>;
  cost_snapshot?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}

function repr(value: unknown): string {
  return value == null ? "None" : `'${String(value)}'`;
}

export function getPipelineStages(pipelineType: string | null | undefined): string[] {
  if (pipelineType == null) return [...STAGES];
  try {
    const manifest = loadPipeline(pipelineType);
    const order = getStageOrder(manifest);
    return order.length ? order : [...STAGES];
  } catch {
    return [...STAGES];
  }
}

function validateArtifactsForStage(stage: string, status: string, artifacts: Record<string, unknown>): void {
  const requiredArtifact = CANONICAL_STAGE_ARTIFACTS[stage];
  if (requiredArtifact && (status === "completed" || status === "awaiting_human") && !(requiredArtifact in artifacts)) {
    throw new CheckpointValidationError(
      `Stage '${stage}' with status '${status}' must include canonical artifact '${requiredArtifact}'`,
    );
  }

  for (const [artifactName, artifactData] of Object.entries(artifacts)) {
    if (!ARTIFACT_NAMES.has(artifactName)) continue;
    if (artifactData === null || typeof artifactData !== "object" || Array.isArray(artifactData)) {
      throw new CheckpointValidationError(
        `Artifact '${artifactName}' must be a JSON object matching its schema`,
      );
    }
  }
}

export function validateCheckpoint(checkpoint: Record<string, unknown>): void {
  const stage = checkpoint.stage;
  const status = checkpoint.status;
  const artifacts = checkpoint.artifacts;
  const pipelineType = checkpoint.pipeline_type;
  const validStages = typeof pipelineType === "string" && pipelineType
    ? new Set(getPipelineStages(pipelineType))
    : ALL_KNOWN_STAGES;

  if (typeof stage !== "string" || !validStages.has(stage)) {
    throw new CheckpointValidationError(
      `Invalid stage: ${repr(stage)} for pipeline ${repr(pipelineType)}. Valid stages: ${JSON.stringify([...validStages].sort())}`,
    );
  }
  if (typeof status !== "string") throw new CheckpointValidationError(`Invalid status: ${repr(status)}`);
  if (artifacts === null || typeof artifacts !== "object" || Array.isArray(artifacts)) {
    throw new CheckpointValidationError("Checkpoint artifacts must be a dictionary");
  }

  validateArtifactsForStage(stage, status, artifacts as Record<string, unknown>);
}

function checkpointPath(pipelineDir: string, projectId: string, stage: string): string {
  return join(pipelineDir, projectId, `checkpoint_${stage}.json`);
}

function decisionLogPath(pipelineDir: string, projectId: string): string {
  return join(pipelineDir, projectId, "decision_log.json");
}

function mergeDecisionLog(pipelineDir: string, projectId: string, newLog: Record<string, unknown>): void {
  const path = decisionLogPath(pipelineDir, projectId);
  const existing: { version: string; project_id: string; decisions: Record<string, unknown>[] } = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { version: "1.0", project_id: projectId, decisions: [] };
  const existingIds = new Set(existing.decisions.map((decision) => decision.decision_id));
  const newDecisions = Array.isArray(newLog.decisions) ? newLog.decisions : [];
  for (const decision of newDecisions) {
    if (decision && typeof decision === "object" && !existingIds.has((decision as Record<string, unknown>).decision_id)) {
      existing.decisions.push(decision as Record<string, unknown>);
    }
  }
  mkdirSync(join(pipelineDir, projectId), { recursive: true });
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`);
}

export interface WriteCheckpointOptions {
  pipeline_type?: string | null;
  style_playbook?: string | null;
  checkpoint_policy?: string;
  human_approval_required?: boolean;
  human_approved?: boolean;
  review?: Record<string, unknown> | null;
  cost_snapshot?: Record<string, unknown> | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function writeCheckpoint(
  pipelineDir: string,
  projectId: string,
  stage: string,
  status: string,
  artifacts: Record<string, unknown>,
  opts: WriteCheckpointOptions = {},
): string {
  const validStages = opts.pipeline_type ? new Set(getPipelineStages(opts.pipeline_type)) : ALL_KNOWN_STAGES;
  if (!validStages.has(stage)) {
    throw new Error(
      `Invalid stage: '${stage}' for pipeline ${repr(opts.pipeline_type)}. Valid stages: ${JSON.stringify([...validStages].sort())}`,
    );
  }

  const checkpoint: PipelineCheckpoint = {
    version: "1.0",
    project_id: projectId,
    pipeline_type: opts.pipeline_type ?? "unknown",
    stage,
    status,
    timestamp: new Date().toISOString(),
    checkpoint_policy: opts.checkpoint_policy ?? "guided",
    human_approval_required: opts.human_approval_required ?? false,
    human_approved: opts.human_approved ?? false,
    artifacts,
  };
  if (opts.style_playbook != null) checkpoint.style_playbook = opts.style_playbook;
  if (opts.review != null) checkpoint.review = opts.review;
  if (opts.cost_snapshot != null) checkpoint.cost_snapshot = opts.cost_snapshot;
  if (opts.error != null) checkpoint.error = opts.error;
  if (opts.metadata != null) checkpoint.metadata = opts.metadata;

  const decisionLog = artifacts.decision_log;
  if (decisionLog && typeof decisionLog === "object" && !Array.isArray(decisionLog)) {
    mergeDecisionLog(pipelineDir, projectId, decisionLog as Record<string, unknown>);
    const logRef = decisionLogPath(pipelineDir, projectId);
    for (const artifactKey of ["proposal_packet", "render_report"]) {
      const artifact = artifacts[artifactKey];
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) continue;
      if (artifactKey === "proposal_packet") {
        const plan = (artifact as Record<string, unknown>).production_plan;
        if (plan && typeof plan === "object" && !Array.isArray(plan)) {
          (plan as Record<string, unknown>).decision_log_ref = logRef;
        }
      } else {
        (artifact as Record<string, unknown>).decision_log_ref = logRef;
      }
    }
  }

  validateCheckpoint(checkpoint as unknown as Record<string, unknown>);
  const path = checkpointPath(pipelineDir, projectId, stage);
  mkdirSync(join(pipelineDir, projectId), { recursive: true });
  writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`);
  return path;
}

export function readCheckpoint(pipelineDir: string, projectId: string, stage: string): PipelineCheckpoint | null {
  const path = checkpointPath(pipelineDir, projectId, stage);
  if (!existsSync(path)) return null;
  const checkpoint = JSON.parse(readFileSync(path, "utf8")) as PipelineCheckpoint;
  validateCheckpoint(checkpoint as unknown as Record<string, unknown>);
  return checkpoint;
}

export function getLatestCheckpoint(pipelineDir: string, projectId: string): PipelineCheckpoint | null {
  const projectDir = join(pipelineDir, projectId);
  if (!existsSync(projectDir)) return null;
  const checkpoints = readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^checkpoint_.*\.json$/.test(entry.name))
    .map((entry) => readCheckpoint(pipelineDir, projectId, entry.name.replace(/^checkpoint_/, "").replace(/\.json$/, "")))
    .filter((checkpoint): checkpoint is PipelineCheckpoint => checkpoint !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return checkpoints[0] ?? null;
}

export function getCompletedStages(pipelineDir: string, projectId: string, pipelineType: string | null = null): string[] {
  const stagesToCheck = getPipelineStages(pipelineType);
  const completed: string[] = [];
  for (const stage of stagesToCheck) {
    const checkpoint = readCheckpoint(pipelineDir, projectId, stage);
    if (checkpoint?.status === "completed") completed.push(stage);
  }
  return completed;
}

export function getNextStage(pipelineDir: string, projectId: string, pipelineType: string | null = null): string | null {
  const stages = pipelineType ? getPipelineStages(pipelineType) : STAGES;
  const completed = new Set(getCompletedStages(pipelineDir, projectId, pipelineType));
  for (const stage of stages) {
    if (!completed.has(stage)) return stage;
  }
  return null;
}
