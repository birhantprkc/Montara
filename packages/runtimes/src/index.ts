// @montara/runtimes - external local runtime health, install recipes, and launch guidance.
//
// These runtimes are invoked over localhost APIs. Montara does not vendor their
// source or model weights; this package only reports health and safe setup steps.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export type RuntimeId = "comfyui" | "a1111";
export type RuntimeStatus = "reachable" | "configured" | "not-configured" | "unreachable";
export type RuntimePlanMode = "install" | "launch";
export type RuntimePlatform = string;

export interface RuntimeDefinition {
  id: RuntimeId;
  name: string;
  kind: "image-video" | "image";
  defaultUrl: string;
  envVar: string;
  providerEnv: string;
  healthPath: string;
  licenseBoundary: string;
  unlocks: string[];
  installSteps: string[];
  repoUrl: string;
  defaultPort: number;
}

export interface RuntimeHealth {
  id: RuntimeId;
  name: string;
  status: RuntimeStatus;
  url: string;
  envVar: string;
  providerEnv: string;
  reachable: boolean;
  checked: boolean;
  error?: string;
  unlocks: string[];
  installSteps: string[];
  licenseBoundary: string;
}

export interface RuntimeStatusReport {
  generatedAt: string;
  probe: boolean;
  summary: {
    total: number;
    reachable: number;
    configured: number;
    missing: number;
  };
  runtimes: RuntimeHealth[];
  notes: string[];
}

export interface RuntimeStatusOptions {
  env?: Record<string, string | undefined>;
  probe?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RuntimeCommand {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
}

export interface ManagedRuntimePlan {
  id: RuntimeId;
  name: string;
  mode: RuntimePlanMode;
  rootDir: string;
  runtimeDir: string;
  url: string;
  env: Record<string, string>;
  commands: RuntimeCommand[];
  executed: boolean;
  notes: string[];
}

export interface RuntimeManagerOptions {
  env?: Record<string, string | undefined>;
  rootDir?: string;
  execute?: boolean;
  detached?: boolean;
  logDir?: string;
  platform?: RuntimePlatform;
}

export interface RuntimeManagerResult {
  ok: boolean;
  plan: ManagedRuntimePlan;
  executed: boolean;
  error?: string;
}

export const RUNTIMES: RuntimeDefinition[] = [
  {
    id: "comfyui",
    name: "ComfyUI",
    kind: "image-video",
    defaultUrl: "http://127.0.0.1:8188",
    envVar: "COMFYUI_URL",
    providerEnv: "COMFYUI_URL",
    healthPath: "/system_stats",
    licenseBoundary: "External runtime. Do not copy ComfyUI source or model weights into this repo.",
    unlocks: ["WAN/Hunyuan/CogVideo/LTX local video", "SD/SDXL/FLUX local image generation"],
    installSteps: [
      "Install ComfyUI externally with Pinokio, git, or the official standalone package.",
      "Launch ComfyUI and confirm its web UI opens locally.",
      "Set COMFYUI_URL=http://127.0.0.1:8188 if you use a non-default port.",
      "Run montara runtimes status to confirm Montara can reach /system_stats.",
    ],
    repoUrl: "https://github.com/comfyanonymous/ComfyUI.git",
    defaultPort: 8188,
  },
  {
    id: "a1111",
    name: "AUTOMATIC1111 Stable Diffusion WebUI",
    kind: "image",
    defaultUrl: "http://127.0.0.1:7860",
    envVar: "A1111_URL",
    providerEnv: "A1111_URL",
    healthPath: "/sdapi/v1/options",
    licenseBoundary: "External runtime. Keep the AGPL WebUI and model weights outside this repo.",
    unlocks: ["local Stable Diffusion image generation", "local img2img/control workflows when exposed by the WebUI API"],
    installSteps: [
      "Install AUTOMATIC1111 externally and launch it with API mode enabled.",
      "Confirm the WebUI opens locally.",
      "Set A1111_URL=http://127.0.0.1:7860 if you use a non-default port.",
      "Run montara runtimes status to confirm Montara can reach /sdapi/v1/options.",
    ],
    repoUrl: "https://github.com/AUTOMATIC1111/stable-diffusion-webui.git",
    defaultPort: 7860,
  },
];

export function listRuntimes(): RuntimeDefinition[] {
  return [...RUNTIMES];
}

export function getRuntime(id: string): RuntimeDefinition | undefined {
  return RUNTIMES.find((runtime) => runtime.id === id);
}

export function runtimeUrl(runtime: RuntimeDefinition, env: Record<string, string | undefined> = process.env): string {
  return (env[runtime.envVar] || runtime.defaultUrl).replace(/\/+$/, "");
}

export function runtimeInstallPlan(id: RuntimeId): string[] {
  const runtime = getRuntime(id);
  return runtime ? [...runtime.installSteps] : [];
}

export function runtimeEnvHints(env: Record<string, string | undefined> = process.env): Record<RuntimeId, string> {
  return Object.fromEntries(RUNTIMES.map((runtime) => [runtime.id, runtimeUrl(runtime, env)])) as Record<RuntimeId, string>;
}

export function runtimeWorkspaceRoot(env: Record<string, string | undefined> = process.env): string {
  if (env.MONTARA_RUNTIMES_DIR) return env.MONTARA_RUNTIMES_DIR;
  if (process.platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "Montara", "runtimes");
  return join(env.HOME || env.USERPROFILE || process.cwd(), ".montara", "runtimes");
}

function shellCommand(command: string, args: string[] = [], cwd?: string): RuntimeCommand {
  return { label: command, command, args, cwd };
}

function pythonBin(runtimeDir: string, platform: RuntimePlatform): string {
  return platform === "win32"
    ? join(runtimeDir, ".venv", "Scripts", "python.exe")
    : join(runtimeDir, ".venv", "bin", "python");
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function psLine(cmd: RuntimeCommand): string {
  return `& ${[cmd.command, ...cmd.args].map(psQuote).join(" ")}`;
}

function shLine(cmd: RuntimeCommand): string {
  return [cmd.command, ...cmd.args].map(shQuote).join(" ");
}

function installCommands(runtime: RuntimeDefinition, runtimeDir: string, platform: RuntimePlatform): RuntimeCommand[] {
  const py = pythonBin(runtimeDir, platform);
  const commands: RuntimeCommand[] = [];
  if (!existsSync(runtimeDir)) {
    commands.push({ label: `clone ${runtime.name}`, command: "git", args: ["clone", "--depth=1", runtime.repoUrl, runtimeDir] });
  }
  commands.push(shellCommand("python", ["-m", "venv", ".venv"], runtimeDir));
  if (runtime.id === "comfyui") {
    commands.push(shellCommand(py, ["-m", "pip", "install", "-r", "requirements.txt"], runtimeDir));
  } else {
    commands.push(shellCommand(py, ["-m", "pip", "install", "-r", "requirements_versions.txt"], runtimeDir));
  }
  return commands;
}

function launchCommands(runtime: RuntimeDefinition, runtimeDir: string, platform: RuntimePlatform): RuntimeCommand[] {
  if (runtime.id === "a1111") {
    return platform === "win32"
      ? [shellCommand("cmd", ["/c", "webui.bat", "--api", "--listen", "--port", String(runtime.defaultPort)], runtimeDir)]
      : [shellCommand("./webui.sh", ["--api", "--listen", "--port", String(runtime.defaultPort)], runtimeDir)];
  }
  return [shellCommand(pythonBin(runtimeDir, platform), ["main.py", "--listen", "127.0.0.1", "--port", String(runtime.defaultPort)], runtimeDir)];
}

export function managedRuntimePlan(
  id: RuntimeId,
  mode: RuntimePlanMode,
  opts: RuntimeManagerOptions = {},
): ManagedRuntimePlan {
  const runtime = getRuntime(id);
  if (!runtime) throw new Error(`unknown runtime: ${id}`);
  const env = opts.env ?? process.env;
  const rootDir = opts.rootDir ?? runtimeWorkspaceRoot(env);
  const runtimeDir = join(rootDir, id);
  const url = runtimeUrl(runtime, { ...env, [runtime.envVar]: env[runtime.envVar] ?? runtime.defaultUrl });
  const platform = opts.platform ?? process.platform;
  const commands = mode === "install" ? installCommands(runtime, runtimeDir, platform) : launchCommands(runtime, runtimeDir, platform);
  return {
    id,
    name: runtime.name,
    mode,
    rootDir,
    runtimeDir,
    url,
    env: {
      [runtime.envVar]: url,
      MONTARA_RUNTIMES_DIR: rootDir,
    },
    commands,
    executed: false,
    notes: [
      runtime.licenseBoundary,
      "Managed install/launch writes outside the Montara repository by default.",
      "Model downloads remain user-controlled; install recipes only prepare the runtime shell.",
    ],
  };
}

export function writeRuntimeEnv(plan: ManagedRuntimePlan, outPath: string): string {
  mkdirSync(dirname(outPath), { recursive: true });
  const body = Object.entries(plan.env).map(([key, value]) => `${key}=${value}`).join("\n");
  writeFileSync(outPath, `${body}\n`);
  return outPath;
}

export function writeRuntimeScript(plan: ManagedRuntimePlan, outPath: string): string {
  mkdirSync(dirname(outPath), { recursive: true });
  const isPs1 = /\.ps1$/i.test(outPath);
  const lines = isPs1
    ? [
        "$ErrorActionPreference = 'Stop'",
        `New-Item -ItemType Directory -Force -Path ${psQuote(plan.rootDir)} | Out-Null`,
        ...plan.commands.map((cmd) => cmd.cwd ? `Push-Location ${psQuote(cmd.cwd)}; try { ${psLine(cmd)} } finally { Pop-Location }` : psLine(cmd)),
      ]
    : [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `mkdir -p ${shQuote(plan.rootDir)}`,
        ...plan.commands.map((cmd) => cmd.cwd ? `(cd ${shQuote(cmd.cwd)} && ${shLine(cmd)})` : shLine(cmd)),
      ];
  writeFileSync(outPath, `${lines.join("\n")}\n`);
  return outPath;
}

function runCommand(cmd: RuntimeCommand): { ok: boolean; error?: string } {
  const result = spawnSync(cmd.command, cmd.args, {
    cwd: cmd.cwd,
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32" && !cmd.command.toLowerCase().endsWith(".exe"),
  });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim().slice(-1000) };
}

export function installRuntime(id: RuntimeId, opts: RuntimeManagerOptions = {}): RuntimeManagerResult {
  const plan = managedRuntimePlan(id, "install", opts);
  if (!opts.execute) return { ok: true, plan, executed: false };
  mkdirSync(plan.rootDir, { recursive: true });
  for (const command of plan.commands) {
    const result = runCommand(command);
    if (!result.ok) return { ok: false, plan: { ...plan, executed: true }, executed: true, error: result.error };
  }
  return { ok: true, plan: { ...plan, executed: true }, executed: true };
}

export function launchRuntime(id: RuntimeId, opts: RuntimeManagerOptions = {}): RuntimeManagerResult {
  const plan = managedRuntimePlan(id, "launch", opts);
  if (!opts.execute) return { ok: true, plan, executed: false };
  mkdirSync(opts.logDir ?? join(plan.rootDir, "logs"), { recursive: true });
  const cmd = plan.commands[0];
  if (!cmd) return { ok: false, plan, executed: false, error: "no launch command" };
  const launch = process.platform === "win32"
    ? spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        `Start-Process -WorkingDirectory '${cmd.cwd ?? plan.runtimeDir}' -FilePath '${cmd.command}' -ArgumentList ${cmd.args.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(",")}`,
      ], { encoding: "utf8" })
    : spawnSync("sh", ["-c", `cd ${shQuote(cmd.cwd ?? plan.runtimeDir)} && nohup ${shLine(cmd)} >/dev/null 2>&1 &`], { encoding: "utf8" });
  if (launch.status === 0) return { ok: true, plan: { ...plan, executed: true }, executed: true };
  return {
    ok: false,
    plan: { ...plan, executed: true },
    executed: true,
    error: (launch.stderr || launch.stdout || launch.error?.message || `exit ${launch.status}`).trim().slice(-1000),
  };
}

async function probeUrl(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeRuntime(
  id: RuntimeId,
  opts: RuntimeStatusOptions = {},
): Promise<RuntimeHealth> {
  const runtime = getRuntime(id);
  if (!runtime) throw new Error(`unknown runtime: ${id}`);
  const env = opts.env ?? process.env;
  const url = runtimeUrl(runtime, env);
  const configured = Boolean(env[runtime.envVar]);
  const base: RuntimeHealth = {
    id: runtime.id,
    name: runtime.name,
    status: configured ? "configured" : "not-configured",
    url,
    envVar: runtime.envVar,
    providerEnv: runtime.providerEnv,
    reachable: false,
    checked: Boolean(opts.probe),
    unlocks: [...runtime.unlocks],
    installSteps: [...runtime.installSteps],
    licenseBoundary: runtime.licenseBoundary,
  };
  if (!opts.probe) return base;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { ...base, status: configured ? "configured" : "not-configured", error: "fetch unavailable in this Node runtime" };
  const result = await probeUrl(`${url}${runtime.healthPath}`, opts.timeoutMs ?? 1200, fetchImpl);
  if (result.ok) return { ...base, status: "reachable", reachable: true };
  return { ...base, status: configured ? "unreachable" : "not-configured", error: result.error };
}

export async function runtimeStatusReport(opts: RuntimeStatusOptions = {}): Promise<RuntimeStatusReport> {
  const probe = opts.probe ?? true;
  const runtimes = await Promise.all(RUNTIMES.map((runtime) => probeRuntime(runtime.id, { ...opts, probe })));
  const reachable = runtimes.filter((runtime) => runtime.reachable).length;
  const configured = runtimes.filter((runtime) => runtime.status === "configured" || runtime.status === "reachable" || runtime.status === "unreachable").length;
  return {
    generatedAt: new Date().toISOString(),
    probe,
    summary: {
      total: runtimes.length,
      reachable,
      configured,
      missing: runtimes.length - configured,
    },
    runtimes,
    notes: [
      "Montara invokes local generation runtimes over localhost APIs.",
      "No runtime source, model weights, or secrets are bundled in this repo.",
      "Unavailable runtimes must not block a video; fall back to local FFmpeg/design scenes or BYOK providers.",
    ],
  };
}
