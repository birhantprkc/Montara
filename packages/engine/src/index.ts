// @montara/engine — TypeScript boundary that deliberately drives the local Python engine.
// A thin, dependency-free process bridge: it shells out to `engine_bridge.py` and parses a
// JSON contract. This is the seam Montara wraps the mature engine through (Stage 1A) before
// any module is replaced with a verified TypeScript implementation.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EngineComposition } from "./timeline";

export * from "./timeline";
export * from "./render";

const BRIDGE_SCRIPT = "engine_bridge.py";

export interface EngineInfo {
  ok: boolean;
  python_version: string;
  executable: string;
  engine_root: string;
  tools: number;
  lib: number;
  skills: number;
  schemas: number;
  pipelines: string[];
  missing: string[];
}

export interface EngineVerify {
  ok: boolean;
  parsed: number;
  errors: number;
  bad: { file: string; line: number; msg: string }[];
}

export interface BridgeResult<T> {
  ok: boolean;
  data: T | null;
  error?: string;
}

/** Resolve the repo root holding the engine (cwd in the harness; walk up as a fallback). */
export function engineRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, BRIDGE_SCRIPT))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** First working Python 3 interpreter on PATH, or null. */
export function findPython(): string | null {
  for (const cand of ["python", "python3", "py"]) {
    const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cand;
  }
  return null;
}

/** Run a bridge command and parse its single JSON object. Never throws. */
export function runEngineBridge<T = unknown>(args: string[], root: string = engineRoot()): BridgeResult<T> {
  const py = findPython();
  if (!py) return { ok: false, data: null, error: "Python 3 not found on PATH" };
  const script = join(root, BRIDGE_SCRIPT);
  if (!existsSync(script)) return { ok: false, data: null, error: `engine bridge not found at ${script}` };
  const r = spawnSync(py, [script, ...args], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return { ok: false, data: null, error: (r.stderr || `python exited ${r.status}`).trim() };
  try {
    return { ok: true, data: JSON.parse(r.stdout || "null") as T };
  } catch {
    return { ok: false, data: null, error: `non-JSON bridge output: ${(r.stdout || "").slice(0, 200)}` };
  }
}

export function engineInfo(root: string = engineRoot()): EngineInfo | null {
  const res = runEngineBridge<EngineInfo>(["info"], root);
  return res.ok ? res.data : null;
}

export function engineVerify(root: string = engineRoot()): EngineVerify | null {
  const res = runEngineBridge<EngineVerify>(["verify"], root);
  return res.ok ? res.data : null;
}

/** Names of the engine's checked-in zero-key compositions. */
export function engineCompositionNames(root: string = engineRoot()): string[] {
  const res = runEngineBridge<{ ok: boolean; compositions: string[] }>(["compositions"], root);
  return res.ok && res.data ? res.data.compositions : [];
}

/** Pull one engine composition (cuts/theme/audio) through the JSON bridge. */
export function engineComposition(name: string, root: string = engineRoot()): EngineComposition | null {
  const res = runEngineBridge<EngineComposition>(["composition", name], root);
  return res.ok && res.data && Array.isArray(res.data.cuts) ? res.data : null;
}

export interface EngineReadiness {
  ready: boolean;
  python: string | null;
  reasons: string[];
  info: EngineInfo | null;
}

/** Engine readiness for `montara doctor` — degrade-friendly, never throws. */
export function engineReady(root: string = engineRoot()): EngineReadiness {
  const python = findPython();
  const reasons: string[] = [];
  if (!python) reasons.push("Python 3 not found on PATH");
  const info = python ? engineInfo(root) : null;
  if (python && !info) reasons.push("engine bridge returned no info");
  if (info && info.missing.length) reasons.push(`missing engine dirs: ${info.missing.join(", ")}`);
  const ready = Boolean(python && info && info.ok);
  return { ready, python, reasons, info };
}
