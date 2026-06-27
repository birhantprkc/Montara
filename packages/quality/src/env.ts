// Small .env loader plus typed environment accessors.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type EnvMap = Record<string, string | undefined>;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const eq = normalized.indexOf("=");
  if (eq < 1) return null;
  const key = normalized.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  const rawValue = normalized.slice(eq + 1);
  return [key, stripQuotes(rawValue)];
}

export function parseEnvText(text: string): EnvMap {
  const parsed: EnvMap = {};
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const pair = parseEnvLine(line);
    if (pair) parsed[pair[0]] = pair[1];
  }
  return parsed;
}

export function loadEnv(projectRoot = process.cwd(), target: EnvMap = process.env): void {
  const envPath = join(projectRoot, ".env");
  if (!existsSync(envPath)) return;
  const parsed = parseEnvText(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] == null) target[key] = value;
  }
}

export function getEnv(key: string, defaultValue: string | null = null, source: EnvMap = process.env): string | null {
  return source[key] ?? defaultValue;
}

export function requireEnv(key: string, source: EnvMap = process.env): string {
  const value = source[key];
  if (value == null) throw new Error(`Required environment variable '${key}' is not set`);
  return value;
}
