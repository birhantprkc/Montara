// @montara/vision - subprocess bridge to the Python vision workers.
//
// Every worker speaks the same JSON contract on stdout and exits 0 when a runtime or
// checkpoint is missing. That distinction matters: "unavailable" is a degrade signal,
// "failed" is a real error. Callers must never treat a missing model as fatal.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runtimeWorkspaceRoot, type RuntimeId } from "../../runtimes/src/index";

export interface WorkerOutcome<T> {
  ok: boolean;
  /** True when the model or its runtime is not installed on this machine. */
  unavailable: boolean;
  error: string;
  data?: T;
  artifacts: string[];
}

/** Per-family interpreter override, matching the runtime definitions. */
const PYTHON_ENV_VAR: Record<string, string> = {
  rvm: "MONTARA_RVM_PYTHON",
  sam2: "MONTARA_SAM2_PYTHON",
  yolo: "MONTARA_YOLO_PYTHON",
};

/**
 * Find the interpreter for a runtime: explicit override, then the managed venv this
 * repo's installer creates, then whatever `python` is on PATH.
 */
export function resolvePython(
  runtimeId: RuntimeId,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env[PYTHON_ENV_VAR[runtimeId] ?? ""];
  if (override) return override;

  const venv = process.platform === "win32"
    ? join(runtimeWorkspaceRoot(env), runtimeId, ".venv", "Scripts", "python.exe")
    : join(runtimeWorkspaceRoot(env), runtimeId, ".venv", "bin", "python");
  if (existsSync(venv)) return venv;

  return env.MONTARA_PYTHON || "python";
}

export function visionScript(name: string, projectRoot = process.cwd()): string {
  return join(projectRoot, "tools", "vision", name);
}

interface RawWorkerPayload {
  success?: boolean;
  unavailable?: boolean;
  error?: string;
  data?: unknown;
  artifacts?: unknown;
}

/** The last JSON object in a stdout stream, so stray prints cannot break parsing. */
function lastJsonBlock(text: string): RawWorkerPayload | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as RawWorkerPayload;
  } catch {
    return null;
  }
}

export interface RunWorkerOptions {
  runtimeId: RuntimeId;
  script: string;
  args: string[];
  projectRoot?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

/** Run a vision worker and normalise its result. Never throws. */
export function runVisionWorker<T>(opts: RunWorkerOptions): WorkerOutcome<T> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const scriptPath = visionScript(opts.script, projectRoot);
  if (!existsSync(scriptPath)) {
    return { ok: false, unavailable: true, error: `vision worker missing: ${scriptPath}`, artifacts: [] };
  }

  const python = resolvePython(opts.runtimeId, opts.env);
  const result = spawnSync(python, [scriptPath, ...opts.args], {
    encoding: "utf8",
    cwd: projectRoot,
    env: { ...process.env, ...opts.env, PYTHONIOENCODING: "utf-8" },
    timeout: opts.timeoutMs ?? 30 * 60 * 1000,
    maxBuffer: 1 << 26,
  });

  if (result.error) {
    return {
      ok: false,
      unavailable: true,
      error: `could not start ${python}: ${result.error.message}`,
      artifacts: [],
    };
  }

  const payload = lastJsonBlock(result.stdout ?? "");
  if (!payload) {
    const tail = (result.stderr || result.stdout || `exit ${result.status}`).trim().slice(-600);
    // No contract on stdout means the interpreter itself could not run the worker.
    return { ok: false, unavailable: true, error: `worker produced no result: ${tail}`, artifacts: [] };
  }

  return {
    ok: payload.success === true,
    unavailable: payload.unavailable === true,
    error: payload.error ?? "",
    data: payload.data as T | undefined,
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.filter((a): a is string => typeof a === "string") : [],
  };
}
