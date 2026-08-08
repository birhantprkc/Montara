// Load `.env` into process.env for the CLI.
//
// The repo ships `.env.example`, `doctor` tells people to put keys in a local `.env`, and the
// demo generator has always loaded one — but the CLI itself only ever read `process.env`. That
// gap is invisible and expensive: keys sit in `.env`, every provider reports "needs KEY", and
// `doctor` says zero configured while the file is right there.
//
// Real environment always wins over the file, so `KEY=x montara ...` and CI secrets still
// override a stale local `.env`.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Parse dotenv text into pairs. Supports `export `, `#` comments, and quoted values. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const index = body.indexOf("=");
    if (index < 1) continue;
    const key = body.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(index + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
      // Only double quotes carry escapes, same as every other dotenv dialect.
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    out[key] = value;
  }
  return out;
}

/** Walk up from `startDir` looking for the nearest `.env`. */
export function findDotEnv(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Merge the nearest `.env` into `process.env` without clobbering anything already set.
 * Returns the key names applied so `doctor` can say where its configuration came from.
 * Never throws and never logs values.
 */
export function loadDotEnv(startDir = process.cwd()): { path?: string; applied: string[] } {
  const path = findDotEnv(startDir);
  if (!path) return { applied: [] };
  let parsed: Record<string, string>;
  try {
    parsed = parseDotEnv(readFileSync(path, "utf8"));
  } catch {
    // An unreadable .env must never take the CLI down; the run just proceeds keyless.
    return { path, applied: [] };
  }
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key]) continue;
    process.env[key] = value;
    applied.push(key);
  }
  return { path, applied };
}
