// @montara/tools — the uniform BaseTool contract.
// Every tool implements this interface for discovery, execution, cost estimation, and status.

import { spawnSync } from "node:child_process";

export type ToolTier = "core" | "voice" | "enhance" | "generate" | "source" | "analyze" | "publish";
export type ToolStability = "experimental" | "beta" | "production";
export type ToolStatus = "available" | "unavailable" | "degraded";
export type ToolRuntime = "local" | "local_gpu" | "api" | "hybrid";
export type ExecutionMode = "sync" | "async";
export type Determinism = "deterministic" | "seeded" | "stochastic";
export type ResumeSupport = "none" | "from_start" | "from_checkpoint";

export interface ResourceProfile {
  cpuCores: number;
  ramMb: number;
  vramMb: number;
  diskMb: number;
  networkRequired: boolean;
}

export const DEFAULT_RESOURCE_PROFILE: ResourceProfile = { cpuCores: 1, ramMb: 512, vramMb: 0, diskMb: 100, networkRequired: false };

export interface RetryPolicy {
  maxRetries: number;
  backoffSeconds: number;
  retryableErrors: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 0, backoffSeconds: 1, retryableErrors: [] };

export interface ToolResult {
  success: boolean;
  data: Record<string, unknown>;
  artifacts: string[];
  error: string | null;
  costUsd: number;
  durationSeconds: number;
  seed: number | null;
  model: string | null;
}

export function toolResult(partial: Partial<ToolResult> & { success: boolean }): ToolResult {
  return {
    success: partial.success,
    data: partial.data ?? {},
    artifacts: partial.artifacts ?? [],
    error: partial.error ?? null,
    costUsd: partial.costUsd ?? 0,
    durationSeconds: partial.durationSeconds ?? 0,
    seed: partial.seed ?? null,
    model: partial.model ?? null,
  };
}

export class DependencyError extends Error {}

export function commandExists(cmd: string): boolean {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(finder, [cmd], { encoding: "utf8" });
  return r.status === 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function fnv1aHex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // widen to a 16-char hex by mixing two passes
  const a = (h >>> 0).toString(16).padStart(8, "0");
  let h2 = h ^ 0x9e3779b9;
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return a + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Full tool contract info for registry/discovery. Keys mirror the reference
 * contract (snake_case) so the scoring engine reads them directly. */
export interface ToolInfo {
  [key: string]: unknown;
  name: string;
  version: string;
  tier: ToolTier;
  capability: string;
  provider: string;
  stability: ToolStability;
  status: ToolStatus;
  execution_mode: ExecutionMode;
  determinism: Determinism;
  runtime: ToolRuntime;
  module_path: string;
  usage_location: string;
  dependencies: string[];
  install_instructions: string;
  capabilities: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  artifact_schema: Record<string, unknown>;
  supports: Record<string, unknown>;
  best_for: string[];
  not_good_for: string[];
  provider_matrix: Record<string, unknown>;
  resource_profile: ResourceProfile;
  resume_support: ResumeSupport;
  side_effects: string[];
  fallback: string | null;
  fallback_tools: string[];
  agent_skills: string[];
  related_skills: string[];
  user_visible_verification: string[];
  quality_score: number | null;
  historical_success_rate: number | null;
  latency_p50_seconds: number | null;
}

/** Abstract base class for all Montara tools. */
export abstract class BaseTool {
  name = "";
  version = "0.1.0";
  tier: ToolTier = "core";
  stability: ToolStability = "experimental";
  executionMode: ExecutionMode = "sync";
  determinism: Determinism = "deterministic";
  runtime: ToolRuntime = "local";

  dependencies: string[] = [];
  installInstructions = "";

  capability = "generic";
  provider = "montara";
  capabilities: string[] = [];
  inputSchema: Record<string, unknown> = {};
  supports: Record<string, unknown> = {};
  bestFor: string[] = [];
  notGoodFor: string[] = [];

  resourceProfile: ResourceProfile = DEFAULT_RESOURCE_PROFILE;
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;
  resumeSupport: ResumeSupport = "none";
  idempotencyKeyFields: string[] = [];
  sideEffects: string[] = [];
  fallback: string | null = null;
  fallbackTools: string[] = [];
  agentSkills: string[] = [];
  userVisibleVerification: string[] = [];
  outputSchema: Record<string, unknown> = {};
  artifactSchema: Record<string, unknown> = {};
  providerMatrix: Record<string, unknown> = {};
  qualityScore: number | null = null;
  historicalSuccessRate: number | null = null;
  latencyP50Seconds: number | null = null;
  usageLocation = "";
  modulePath = "";

  /** Default status: available iff dependencies are satisfied. Override for API key checks. */
  getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    try {
      this.checkDependencies(secrets);
      return "available";
    } catch {
      return "unavailable";
    }
  }

  checkDependencies(secrets: Record<string, string | undefined> = process.env): void {
    for (const dep of this.dependencies) {
      if (dep.startsWith("env:")) {
        const name = dep.slice(4);
        if (!secrets[name]) throw new DependencyError(`Environment variable ${name} not set. ${this.installInstructions}`);
      } else if (dep.startsWith("cmd:")) {
        const cmd = dep.slice(4);
        if (!commandExists(cmd)) throw new DependencyError(`Command ${cmd} not found. ${this.installInstructions}`);
      }
      // python:* dependencies do not apply to the TypeScript port.
    }
  }

  estimateCost(_inputs: Record<string, unknown>): number {
    return 0;
  }

  estimateRuntime(_inputs: Record<string, unknown>): number {
    return 0;
  }

  idempotencyKey(inputs: Record<string, unknown>): string {
    const picked: Record<string, unknown> = {};
    for (const k of this.idempotencyKeyFields) picked[k] = inputs[k];
    return fnv1aHex(stableStringify(picked));
  }

  abstract execute(inputs: Record<string, unknown>): Promise<ToolResult>;

  dryRun(inputs: Record<string, unknown>): Record<string, unknown> {
    return {
      tool: this.name,
      estimatedCostUsd: this.estimateCost(inputs),
      estimatedRuntimeSeconds: this.estimateRuntime(inputs),
      status: this.getStatus(),
      wouldExecute: true,
    };
  }

  getInfo(): ToolInfo {
    return {
      name: this.name,
      version: this.version,
      tier: this.tier,
      capability: this.capability,
      provider: this.provider,
      stability: this.stability,
      status: this.getStatus(),
      execution_mode: this.executionMode,
      determinism: this.determinism,
      runtime: this.runtime,
      module_path: this.modulePath,
      usage_location: this.usageLocation,
      dependencies: this.dependencies,
      install_instructions: this.installInstructions,
      capabilities: this.capabilities,
      input_schema: this.inputSchema,
      output_schema: this.outputSchema,
      artifact_schema: this.artifactSchema,
      supports: this.supports,
      best_for: this.bestFor,
      not_good_for: this.notGoodFor,
      provider_matrix: this.providerMatrix,
      resource_profile: this.resourceProfile,
      resume_support: this.resumeSupport,
      side_effects: this.sideEffects,
      fallback: this.fallback,
      fallback_tools: this.fallbackTools.length ? this.fallbackTools : (this.fallback ? [this.fallback] : []),
      agent_skills: this.agentSkills,
      related_skills: this.agentSkills,
      user_visible_verification: this.userVisibleVerification,
      quality_score: this.qualityScore,
      historical_success_rate: this.historicalSuccessRate,
      latency_p50_seconds: this.latencyP50Seconds,
    };
  }
}
