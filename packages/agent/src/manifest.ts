// @montara/agent — YAML pipeline manifests (§K).
// Deterministically serializes the in-code pipeline definitions to YAML so an external assistant
// (or human) can read the pipeline catalogue as data. A contract test asserts the committed
// manifests never drift from the code (emit === file).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineDef } from "../../ai/src/index";
import { PIPELINE_DEFS } from "../../ai/src/index";

/** Quote a scalar only when it contains YAML-significant characters. */
function scalar(s: string): string {
  return /^[A-Za-z0-9 _.\-]+$/.test(s) ? s : JSON.stringify(s);
}

export function renderPipelineManifest(def: PipelineDef): string {
  const lines: string[] = [];
  lines.push(`# Montara pipeline manifest — ${def.name}`);
  lines.push(`id: ${def.id}`);
  lines.push(`name: ${scalar(def.name)}`);
  lines.push(`blurb: ${scalar(def.blurb)}`);
  lines.push("palette:");
  for (const color of def.palette) lines.push(`  - "${color}"`);
  lines.push("beats:");
  for (const beat of def.beats) {
    lines.push(`  - label: ${scalar(beat.label)}`);
    lines.push(`    weight: ${beat.weight}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writePipelineManifests(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const def of PIPELINE_DEFS) {
    const path = join(dir, `${def.id}.yaml`);
    writeFileSync(path, renderPipelineManifest(def));
    written.push(path);
  }
  return written;
}
