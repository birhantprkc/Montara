// Pipeline manifest loader and capability helpers.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseSimpleYaml, type YamlObject } from "./yaml";
import { readFileSync } from "node:fs";

export const PIPELINE_DEFS_DIR = join(process.cwd(), "pipelines");

export interface PipelineStageManifest {
  name: string;
  skill?: string;
  review_focus?: string[];
  preferred_tools?: string[];
  fallback_tools?: string[];
  tools_available?: string[];
  sub_stages?: PipelineSubStage[];
  [key: string]: unknown;
}

export interface PipelineSubStage {
  name: string;
  condition?: string;
  tools_available?: string[];
  [key: string]: unknown;
}

export interface PipelineManifest {
  name?: string;
  stages?: PipelineStageManifest[];
  reference_input?: YamlObject;
  extensions?: Record<string, boolean>;
  [key: string]: unknown;
}

export class ExtensionNotPermitted extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionNotPermitted";
  }
}

function asManifest(value: YamlObject): PipelineManifest {
  return value as PipelineManifest;
}

export function loadPipeline(name: string, defsDir = PIPELINE_DEFS_DIR): PipelineManifest {
  const path = join(defsDir, `${name}.yaml`);
  if (!existsSync(path)) throw new Error(`Pipeline manifest not found: ${path}`);
  return asManifest(parseSimpleYaml(readFileSync(path, "utf8")));
}

export function listPipelines(defsDir = PIPELINE_DEFS_DIR): string[] {
  if (!existsSync(defsDir)) return [];
  return readdirSync(defsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => entry.name.replace(/\.yaml$/, ""));
}

function conditionIsActive(condition: string | undefined, context: Record<string, unknown> | null | undefined): boolean {
  if (!condition) return true;
  if (!context) return false;
  return Boolean(context[condition]);
}

export function getReferenceInputConfig(manifest: PipelineManifest): YamlObject {
  return manifest.reference_input ?? {};
}

export function pipelineSupportsReferenceInput(manifest: PipelineManifest): boolean {
  return Boolean(getReferenceInputConfig(manifest).supported);
}

export function getStageSubStages(
  manifest: PipelineManifest,
  stageName: string,
  opts: { context?: Record<string, unknown>; includeInactive?: boolean } = {},
): PipelineSubStage[] {
  const includeInactive = opts.includeInactive ?? true;
  for (const stage of manifest.stages ?? []) {
    if (stage.name !== stageName) continue;
    const subStages = [...(stage.sub_stages ?? [])];
    if (includeInactive) return subStages;
    return subStages.filter((subStage) => conditionIsActive(subStage.condition, opts.context));
  }
  return [];
}

export function getStageOrder(
  manifest: PipelineManifest,
  opts: { includeSubStages?: boolean; context?: Record<string, unknown> } = {},
): string[] {
  const order: string[] = [];
  for (const stage of manifest.stages ?? []) {
    order.push(stage.name);
    if (!opts.includeSubStages) continue;
    for (const subStage of getStageSubStages(manifest, stage.name, {
      context: opts.context,
      includeInactive: opts.context == null,
    })) {
      order.push(`${stage.name}.${subStage.name}`);
    }
  }
  return order;
}

export function getRequiredTools(manifest: PipelineManifest): Set<string> {
  const tools = new Set<string>();
  for (const stage of manifest.stages ?? []) {
    for (const tool of stage.preferred_tools ?? []) tools.add(tool);
    for (const tool of stage.fallback_tools ?? []) tools.add(tool);
    for (const tool of stage.tools_available ?? []) tools.add(tool);
    for (const subStage of stage.sub_stages ?? []) {
      for (const tool of subStage.tools_available ?? []) tools.add(tool);
    }
  }
  const referenceTools = getReferenceInputConfig(manifest).analysis_tools;
  if (Array.isArray(referenceTools)) for (const tool of referenceTools) tools.add(String(tool));
  return tools;
}

export function getStageSkill(manifest: PipelineManifest, stageName: string): string | null {
  for (const stage of manifest.stages ?? []) {
    if (stage.name === stageName) return stage.skill ?? null;
  }
  return null;
}

export function getStageReviewFocus(manifest: PipelineManifest, stageName: string): string[] {
  for (const stage of manifest.stages ?? []) {
    if (stage.name === stageName) return stage.review_focus ?? [];
  }
  return [];
}

export function checkExtensionPermitted(manifest: PipelineManifest, extensionType: string): void {
  const validExtensions = new Set(["custom_scripts", "custom_playbooks", "custom_skills", "custom_tools"]);
  if (!validExtensions.has(extensionType)) {
    throw new Error(`Unknown extension type '${extensionType}'. Valid types: ${JSON.stringify([...validExtensions].sort())}`);
  }

  const extensions = manifest.extensions ?? {};
  if (!extensions[extensionType]) {
    throw new ExtensionNotPermitted(
      `Pipeline '${manifest.name ?? "unknown"}' does not permit ${extensionType}. ` +
      `Set extensions.${extensionType}: true in the pipeline manifest to allow this.`,
    );
  }
}

export function getPermittedExtensions(manifest: PipelineManifest): Record<string, boolean> {
  const defaults: Record<string, boolean> = {
    custom_scripts: false,
    custom_playbooks: false,
    custom_skills: false,
    custom_tools: false,
  };
  return { ...defaults, ...(manifest.extensions ?? {}) };
}
