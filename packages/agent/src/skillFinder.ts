// @montara/agent — skill discovery ("find-skills"). Montara ships a large skills/ library; this
// lets an assistant, the CLI, or a GUI search it by keyword and load the right one, instead of an
// LLM guessing a path. Pure filesystem read of skills/**/*.md (title = first heading, summary =
// first prose line), so it stays in sync with the docs automatically.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export interface SkillEntry {
  /** Path relative to skills/, e.g. "editing/masks.md". */
  id: string;
  path: string;
  title: string;
  summary: string;
  category: string;
}

/** Walk up from `start` to find the repo's skills/ directory. */
export function skillsRoot(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "skills");
    if (existsSync(join(p, "INDEX.md")) || existsSync(p)) {
      if (existsSync(p) && statSync(p).isDirectory()) return p;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function walk(dir: string, out: string[]): void {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "index.md") out.push(p);
  }
}

function parseSkill(file: string, root: string): SkillEntry {
  let title = "", summary = "";
  try {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!title && t.startsWith("# ")) { title = t.slice(2).trim(); continue; }
      if (title && !summary && t && !t.startsWith("#") && !t.startsWith("|") && !t.startsWith("```")) { summary = t; break; }
    }
  } catch { /* unreadable */ }
  const id = relative(root, file).replace(/\\/g, "/");
  return { id, path: file, title: title || id, summary: summary.slice(0, 200), category: id.split("/")[0] ?? "" };
}

/** Every skill in the library. */
export function listSkills(root: string | null = skillsRoot()): SkillEntry[] {
  if (!root) return [];
  const files: string[] = [];
  walk(root, files);
  return files.map((f) => parseSkill(f, root)).sort((a, b) => a.id.localeCompare(b.id));
}

/** Rank skills by a keyword query (title > summary > path), best first. */
export function findSkills(query: string, root: string | null = skillsRoot(), limit = 10): SkillEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return listSkills(root).slice(0, limit);
  const scored = listSkills(root).map((s) => {
    const title = s.title.toLowerCase(), summary = s.summary.toLowerCase(), id = s.id.toLowerCase();
    let body = "";
    try { body = readFileSync(s.path, "utf8").toLowerCase(); } catch { /* ignore unreadable skill */ }
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      if (summary.includes(t)) score += 2;
      if (id.includes(t)) score += 3;
      if (body.includes(t)) score += 1;
    }
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}
