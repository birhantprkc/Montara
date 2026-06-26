// @montara/agent — per-assistant config generator (§K).
// Montara is driven the readable-system way: an assistant reads instruction files and runs the
// `montara` CLI (no MCP). Each assistant gets a thin pointer file into the shared skills layer.
// This module RENDERS those pointers; callers write them at publish time. The text is deliberately
// product-only — it describes how to drive Montara and nothing about how Montara was built.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AssistantTarget = "claude" | "cursor" | "codex" | "copilot" | "windsurf";

export const ASSISTANT_FILES: Record<AssistantTarget, string> = {
  claude: "CLAUDE.md",
  cursor: "CURSOR.md",
  codex: "CODEX.md",
  copilot: "COPILOT.md",
  windsurf: ".windsurfrules",
};

export const ASSISTANT_TARGETS = Object.keys(ASSISTANT_FILES) as AssistantTarget[];

const ASSISTANT_LABEL: Record<AssistantTarget, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  copilot: "GitHub Copilot",
  windsurf: "Windsurf",
};

export const SKILLS_ENTRY = "skills/core/driving.md";

export function renderAssistantConfig(target: AssistantTarget): string {
  return [
    `# Montara — ${ASSISTANT_LABEL[target]} driving guide`,
    "",
    "You are driving **Montara**, a local-first, IR-centric video engine. Drive it by reading the",
    "shared skills layer and running the CLI — there is no MCP and nothing to wire up.",
    "",
    `1. Read **\`${SKILLS_ENTRY}\`** first — it is the entry point for operating this repo.`,
    "2. Inspect capabilities: `pnpm montara pipelines`, `pnpm montara tools`.",
    "3. Make a video: `pnpm montara make --pipeline <id> \"<idea>\"` (plans → gates → renders → self-reviews).",
    "4. Everything is a transform on the Timeline IR — see `skills/core/timeline-ir.md`.",
    "5. Degrade, never fail: with no API keys and no models, a run still produces a real MP4.",
    "",
  ].join("\n");
}

export function writeAssistantConfigs(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const target of ASSISTANT_TARGETS) {
    const path = join(dir, ASSISTANT_FILES[target]);
    writeFileSync(path, renderAssistantConfig(target));
    written.push(path);
  }
  return written;
}
