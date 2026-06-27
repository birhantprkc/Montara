// Runtime configuration contract and small zero-dependency loaders.

import { resolve } from "node:path";

export type BudgetMode = "observe" | "warn" | "cap";
export type CheckpointPolicy = "guided" | "manual_all" | "auto_noncreative";

export interface LLMConfig {
  provider: string;
  model: string | null;
  temperature: number;
  max_tokens: number;
}

export interface BudgetConfig {
  mode: BudgetMode;
  total_usd: number;
  reserve_pct: number;
  single_action_approval_usd: number;
  require_approval_for_new_paid_tool: boolean;
}

export interface CheckpointConfig {
  policy: CheckpointPolicy;
  storage_dir: string;
}

export interface OutputConfig {
  default_format: string;
  default_codec: string;
  default_audio_codec: string;
  default_resolution: string;
  default_fps: number;
  default_crf: number;
}

export interface PathsConfig {
  pipeline_dir: string;
  library_dir: string;
  styles_dir: string;
  skills_dir: string;
  output_dir: string;
}

export interface MontaraConfig {
  llm: LLMConfig;
  budget: BudgetConfig;
  checkpoint: CheckpointConfig;
  output: OutputConfig;
  paths: PathsConfig;
}

export type ConfigPathKey = keyof PathsConfig;

type ConfigObject = Record<string, unknown>;

export const DEFAULT_CONFIG: MontaraConfig = {
  llm: {
    provider: "anthropic",
    model: null,
    temperature: 0.7,
    max_tokens: 4096,
  },
  budget: {
    mode: "warn",
    total_usd: 10.0,
    reserve_pct: 0.10,
    single_action_approval_usd: 0.50,
    require_approval_for_new_paid_tool: true,
  },
  checkpoint: {
    policy: "guided",
    storage_dir: "pipeline",
  },
  output: {
    default_format: "mp4",
    default_codec: "libx264",
    default_audio_codec: "aac",
    default_resolution: "1920x1080",
    default_fps: 30,
    default_crf: 23,
  },
  paths: {
    pipeline_dir: "pipeline",
    library_dir: "library",
    styles_dir: "styles",
    skills_dir: "skills",
    output_dir: "output",
  },
};

const cloneConfig = (config: MontaraConfig): MontaraConfig => ({
  llm: { ...config.llm },
  budget: { ...config.budget },
  checkpoint: { ...config.checkpoint },
  output: { ...config.output },
  paths: { ...config.paths },
});

function isRecord(value: unknown): value is ConfigObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function section(raw: unknown, key: keyof MontaraConfig): ConfigObject {
  return isRecord(raw) && isRecord(raw[key]) ? raw[key] as ConfigObject : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  return value === null || typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function budgetMode(value: unknown, fallback: BudgetMode): BudgetMode {
  return value === "observe" || value === "warn" || value === "cap" ? value : fallback;
}

function checkpointPolicy(value: unknown, fallback: CheckpointPolicy): CheckpointPolicy {
  return value === "guided" || value === "manual_all" || value === "auto_noncreative" ? value : fallback;
}

export function createConfig(raw: unknown = {}): MontaraConfig {
  const base = cloneConfig(DEFAULT_CONFIG);
  const llm = section(raw, "llm");
  const budget = section(raw, "budget");
  const checkpoint = section(raw, "checkpoint");
  const output = section(raw, "output");
  const paths = section(raw, "paths");

  return {
    llm: {
      provider: stringValue(llm.provider, base.llm.provider),
      model: nullableStringValue(llm.model, base.llm.model),
      temperature: numberValue(llm.temperature, base.llm.temperature),
      max_tokens: numberValue(llm.max_tokens, base.llm.max_tokens),
    },
    budget: {
      mode: budgetMode(budget.mode, base.budget.mode),
      total_usd: numberValue(budget.total_usd, base.budget.total_usd),
      reserve_pct: numberValue(budget.reserve_pct, base.budget.reserve_pct),
      single_action_approval_usd: numberValue(
        budget.single_action_approval_usd,
        base.budget.single_action_approval_usd,
      ),
      require_approval_for_new_paid_tool: booleanValue(
        budget.require_approval_for_new_paid_tool,
        base.budget.require_approval_for_new_paid_tool,
      ),
    },
    checkpoint: {
      policy: checkpointPolicy(checkpoint.policy, base.checkpoint.policy),
      storage_dir: stringValue(checkpoint.storage_dir, base.checkpoint.storage_dir),
    },
    output: {
      default_format: stringValue(output.default_format, base.output.default_format),
      default_codec: stringValue(output.default_codec, base.output.default_codec),
      default_audio_codec: stringValue(output.default_audio_codec, base.output.default_audio_codec),
      default_resolution: stringValue(output.default_resolution, base.output.default_resolution),
      default_fps: numberValue(output.default_fps, base.output.default_fps),
      default_crf: numberValue(output.default_crf, base.output.default_crf),
    },
    paths: {
      pipeline_dir: stringValue(paths.pipeline_dir, base.paths.pipeline_dir),
      library_dir: stringValue(paths.library_dir, base.paths.library_dir),
      styles_dir: stringValue(paths.styles_dir, base.paths.styles_dir),
      skills_dir: stringValue(paths.skills_dir, base.paths.skills_dir),
      output_dir: stringValue(paths.output_dir, base.paths.output_dir),
    },
  };
}

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "\"" && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value) return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : value;
}

function parseSimpleYaml(text: string): ConfigObject {
  const root: ConfigObject = {};
  let current: ConfigObject | null = null;
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripInlineComment(rawLine);
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (indent === 0) {
      if (!value) {
        current = {};
        root[key] = current;
      } else {
        root[key] = parseScalar(value);
        current = null;
      }
    } else if (current) {
      current[key] = parseScalar(value);
    }
  }
  return root;
}

export function parseConfigText(text: string): MontaraConfig {
  const trimmed = text.trim();
  if (!trimmed) return createConfig();
  const raw = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseSimpleYaml(trimmed);
  return createConfig(raw);
}

export function resolveConfigPath(
  config: MontaraConfig,
  key: ConfigPathKey,
  projectRoot = process.cwd(),
): string {
  return resolve(projectRoot, config.paths[key]);
}
