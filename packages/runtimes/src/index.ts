// @montara/runtimes - external local runtime health, install recipes, and launch guidance.
//
// These runtimes are invoked over localhost APIs. Montara does not vendor their
// source or model weights; this package only reports health and safe setup steps.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export type RuntimeId =
  | "comfyui"
  | "a1111"
  | "piper"
  | "faster-whisper"
  | "transformersjs"
  | "rvm"
  | "sam2"
  | "yolo";
export type RuntimeStatus = "reachable" | "configured" | "not-configured" | "unreachable";
export type RuntimePlanMode = "install" | "launch";
export type RuntimePlatform = string;
export type RuntimeProbeKind = "http" | "command" | "python-package" | "node-package";
export type RuntimeKind =
  | "image-video"
  | "image"
  | "audio-tts"
  | "transcription"
  | "vision-models"
  | "matting"
  | "segmentation"
  | "detection";

export {
  probeHardware,
  describeHardware,
  type AcceleratorInfo,
  type AcceleratorKind,
  type HardwareProbeOptions,
  type HardwareProfile,
} from "./hardware";
export {
  VISION_MODELS,
  getVisionModel,
  listVisionModels,
  planVisionModels,
  selectVisionModel,
  type RejectedVariant,
  type VisionDevice,
  type VisionModelFamily,
  type VisionModelPlan,
  type VisionModelSelectOptions,
  type VisionModelSelection,
  type VisionModelVariant,
} from "./visionModels";

export interface RuntimeDefinition {
  id: RuntimeId;
  name: string;
  kind: RuntimeKind;
  probeKind: RuntimeProbeKind;
  defaultUrl: string;
  envVar: string;
  providerEnv: string;
  healthPath: string;
  licenseBoundary: string;
  unlocks: string[];
  installSteps: string[];
  repoUrl: string;
  defaultPort: number;
  packageName?: string;
  command?: string;
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

export interface RuntimeModelInventoryItem {
  id: string;
  runtimeId: RuntimeId;
  kind: "model-directory" | "model-file" | "cache-directory" | "voice-model" | "package-cache";
  envVar: string;
  path?: string;
  configured: boolean;
  purpose: string;
  installHint: string;
}

export interface RuntimeModelInventory {
  generatedAt: string;
  items: RuntimeModelInventoryItem[];
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
    probeKind: "http",
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
    probeKind: "http",
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
  {
    id: "piper",
    name: "Piper TTS",
    kind: "audio-tts",
    probeKind: "command",
    defaultUrl: "piper",
    envVar: "PIPER_BIN",
    providerEnv: "PIPER_BIN",
    healthPath: "",
    licenseBoundary: "External command runtime. Keep Piper binaries and voice models outside this repo.",
    unlocks: ["local offline narration", "zero-key voice placeholders with real TTS when voices are installed"],
    installSteps: [
      "Install Piper externally with pipx, uv, a binary release, or a dedicated venv.",
      "Download voice model files separately and keep their licenses with the project assets.",
      "Set PIPER_BIN to the piper executable path when it is not on PATH.",
      "Run montara runtimes status to confirm the command is available.",
    ],
    repoUrl: "https://github.com/rhasspy/piper.git",
    defaultPort: 0,
    packageName: "piper-tts",
    command: "piper",
  },
  {
    id: "faster-whisper",
    name: "Faster Whisper",
    kind: "transcription",
    probeKind: "python-package",
    defaultUrl: "python:faster_whisper",
    envVar: "MONTARA_WHISPER_PYTHON",
    providerEnv: "MONTARA_WHISPER_PYTHON",
    healthPath: "",
    licenseBoundary: "External Python package and model cache. Do not commit downloaded Whisper weights.",
    unlocks: ["local transcription", "transcript-timed Shorts cuts", "source-media understanding with speech timing"],
    installSteps: [
      "Create a Python environment outside the Montara repo.",
      "Install faster-whisper into that environment.",
      "Set MONTARA_WHISPER_PYTHON to the Python executable when it is not the default python.",
      "Keep model caches outside git and record model/license choices per project.",
    ],
    repoUrl: "https://github.com/SYSTRAN/faster-whisper.git",
    defaultPort: 0,
    packageName: "faster_whisper",
    command: "python",
  },
  {
    id: "transformersjs",
    name: "Transformers.js Vision Models",
    kind: "vision-models",
    probeKind: "node-package",
    defaultUrl: "node:@huggingface/transformers",
    envVar: "MONTARA_VISION_MODELS",
    providerEnv: "MONTARA_VISION_MODELS",
    healthPath: "",
    licenseBoundary: "External npm package and Hugging Face model cache. Do not commit model weights.",
    unlocks: ["local CLIP frame classification", "optional BLIP/image-to-text captions", "model-aware source understanding"],
    installSteps: [
      "Install @huggingface/transformers or @xenova/transformers in the local toolchain.",
      "Set MONTARA_VISION_MODELS=1 only when model downloads/cache access are allowed.",
      "Set MONTARA_CLIP_MODEL and MONTARA_CAPTION_MODEL when using specific cached weights.",
      "Keep Hugging Face caches outside git and record model cards for publication workflows.",
    ],
    repoUrl: "https://github.com/huggingface/transformers.js.git",
    defaultPort: 0,
    packageName: "@huggingface/transformers",
    command: "node",
  },
  {
    id: "rvm",
    name: "Robust Video Matting",
    kind: "matting",
    probeKind: "python-package",
    defaultUrl: "python:torch",
    envVar: "MONTARA_RVM_PYTHON",
    providerEnv: "MONTARA_RVM_PYTHON",
    healthPath: "",
    licenseBoundary: "External Python package and GPL-3.0 weights. Do not commit RVM source or checkpoints.",
    unlocks: [
      "green-screen-free background removal",
      "alpha mattes the compositor can key, replace, or blur behind",
    ],
    installSteps: [
      "Create a Python environment outside the Montara repo.",
      "Install torch and torchvision matching your accelerator (CUDA, ROCm, MPS, or CPU).",
      "Run montara models plan to confirm a variant fits before fetching weights.",
      "Set MONTARA_RVM_PYTHON to that interpreter when it is not the default python.",
    ],
    repoUrl: "https://github.com/PeterL1n/RobustVideoMatting.git",
    defaultPort: 0,
    packageName: "torch",
    command: "python",
  },
  {
    id: "sam2",
    name: "Segment Anything 2",
    kind: "segmentation",
    probeKind: "python-package",
    defaultUrl: "python:sam2",
    envVar: "MONTARA_SAM2_PYTHON",
    providerEnv: "MONTARA_SAM2_PYTHON",
    healthPath: "",
    licenseBoundary: "External Apache-2.0 package with separately licensed checkpoints. Keep both outside this repo.",
    unlocks: [
      "promptable object masks from a click, box, or detection",
      "mask tracking across a shot for professional rotoscoping",
    ],
    installSteps: [
      "Create a Python environment outside the Montara repo.",
      "Install torch for your accelerator, then install the sam2 package.",
      "Run montara models plan to see which SAM 2 tier this machine can run.",
      "Set MONTARA_SAM2_PYTHON to that interpreter when it is not the default python.",
    ],
    repoUrl: "https://github.com/facebookresearch/sam2.git",
    defaultPort: 0,
    packageName: "sam2",
    command: "python",
  },
  {
    id: "yolo",
    name: "YOLO11 Detection",
    kind: "detection",
    probeKind: "python-package",
    defaultUrl: "python:ultralytics",
    envVar: "MONTARA_YOLO_PYTHON",
    providerEnv: "MONTARA_YOLO_PYTHON",
    healthPath: "",
    licenseBoundary: "External Python package. Ultralytics is AGPL-3.0: commercial use needs a licence from them, and weights stay outside this repo.",
    unlocks: [
      "subject and object detection to seed SAM 2 prompts",
      "auto-framing and shot-safe cropping driven by real detections",
    ],
    installSteps: [
      "Create a Python environment outside the Montara repo.",
      "Install ultralytics into that environment.",
      "Run montara models plan to pick a tier that fits this machine.",
      "Review the AGPL-3.0 terms before any commercial use.",
    ],
    repoUrl: "https://github.com/ultralytics/ultralytics.git",
    defaultPort: 0,
    packageName: "ultralytics",
    command: "python",
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

/** Runtimes installed into their own venv/npm dir rather than cloned from a repo. */
const SELF_CONTAINED_RUNTIMES: RuntimeId[] = [
  "piper",
  "faster-whisper",
  "transformersjs",
  "rvm",
  "sam2",
  "yolo",
];

/** pip requirements per venv-installed runtime, in install order. */
const PIP_PACKAGES: Partial<Record<RuntimeId, string[]>> = {
  piper: ["piper-tts"],
  "faster-whisper": ["faster-whisper"],
  rvm: ["torch", "torchvision", "av"],
  sam2: ["torch", "torchvision", "sam2"],
  yolo: ["ultralytics"],
};

function isSelfContained(id: RuntimeId): boolean {
  return SELF_CONTAINED_RUNTIMES.includes(id);
}

function installCommands(runtime: RuntimeDefinition, runtimeDir: string, platform: RuntimePlatform): RuntimeCommand[] {
  const py = pythonBin(runtimeDir, platform);
  const commands: RuntimeCommand[] = [];
  const pip = PIP_PACKAGES[runtime.id];
  if (pip) {
    commands.push(shellCommand("python", ["-m", "venv", ".venv"], runtimeDir));
    commands.push(shellCommand(py, ["-m", "pip", "install", ...pip], runtimeDir));
    return commands;
  }
  if (runtime.id === "transformersjs") {
    commands.push(shellCommand("npm", ["init", "-y"], runtimeDir));
    commands.push(shellCommand("npm", ["install", "@huggingface/transformers"], runtimeDir));
    return commands;
  }
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
  if (runtime.probeKind !== "http") return [];
  if (runtime.id === "a1111") {
    return platform === "win32"
      ? [shellCommand("cmd", ["/c", "webui.bat", "--api", "--listen", "--port", String(runtime.defaultPort)], runtimeDir)]
      : [shellCommand("./webui.sh", ["--api", "--listen", "--port", String(runtime.defaultPort)], runtimeDir)];
  }
  return [shellCommand(pythonBin(runtimeDir, platform), ["main.py", "--listen", "127.0.0.1", "--port", String(runtime.defaultPort)], runtimeDir)];
}

function probeCommand(command: string): { ok: boolean; error?: string } {
  const result = spawnSync(command, ["--help"], {
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32" && !command.toLowerCase().endsWith(".exe"),
  });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim().slice(-600) };
}

function probePythonPackage(python: string, packageName: string): { ok: boolean; error?: string } {
  const result = spawnSync(python, [
    "-c",
    `import importlib.util, sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(packageName)}) else 1)`,
  ], { encoding: "utf8", stdio: "pipe" });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: (result.stderr || result.stdout || result.error?.message || `${packageName} not importable`).trim().slice(-600) };
}

function probeNodePackage(packageName: string): { ok: boolean; error?: string } {
  const result = spawnSync("node", [
    "-e",
    `try { require.resolve(${JSON.stringify(packageName)}); process.exit(0); } catch (e) { process.exit(1); }`,
  ], { encoding: "utf8", stdio: "pipe", cwd: process.cwd() });
  if (result.status === 0) return { ok: true };
  return { ok: false, error: (result.stderr || result.stdout || result.error?.message || `${packageName} not resolvable`).trim().slice(-600) };
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
  const needsRuntimeDir = isSelfContained(plan.id);
  const lines = isPs1
    ? [
        "$ErrorActionPreference = 'Stop'",
        `New-Item -ItemType Directory -Force -Path ${psQuote(plan.rootDir)} | Out-Null`,
        ...(needsRuntimeDir ? [`New-Item -ItemType Directory -Force -Path ${psQuote(plan.runtimeDir)} | Out-Null`] : []),
        ...plan.commands.map((cmd) => cmd.cwd ? `Push-Location ${psQuote(cmd.cwd)}; try { ${psLine(cmd)} } finally { Pop-Location }` : psLine(cmd)),
      ]
    : [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `mkdir -p ${shQuote(plan.rootDir)}`,
        ...(needsRuntimeDir ? [`mkdir -p ${shQuote(plan.runtimeDir)}`] : []),
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
  if (isSelfContained(plan.id)) {
    mkdirSync(plan.runtimeDir, { recursive: true });
  }
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
  if (runtime.probeKind === "command") {
    const command = env[runtime.envVar] || runtime.command || runtime.defaultUrl;
    const result = probeCommand(command);
    if (result.ok) return { ...base, status: "reachable", reachable: true, url: command };
    return { ...base, status: configured ? "unreachable" : "not-configured", url: command, error: result.error };
  }
  if (runtime.probeKind === "python-package") {
    const python = env[runtime.envVar] || "python";
    const result = probePythonPackage(python, runtime.packageName ?? runtime.id);
    if (result.ok) return { ...base, status: "reachable", reachable: true, url: python };
    return { ...base, status: configured ? "unreachable" : "not-configured", url: python, error: result.error };
  }
  if (runtime.probeKind === "node-package") {
    const packages = runtime.id === "transformersjs"
      ? ["@huggingface/transformers", "@xenova/transformers"]
      : [runtime.packageName ?? runtime.id];
    const result = packages.map((packageName) => probeNodePackage(packageName)).find((probe) => probe.ok) ??
      { ok: false, error: `${packages.join(" or ")} not resolvable` };
    if (result.ok) return { ...base, status: "reachable", reachable: true };
    return { ...base, status: configured ? "unreachable" : "not-configured", error: result.error };
  }
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return { ...base, status: configured ? "configured" : "not-configured", error: "fetch unavailable in this Node runtime" };
  const result = await probeUrl(`${url}${runtime.healthPath}`, opts.timeoutMs ?? 1200, fetchImpl);
  if (result.ok) return { ...base, status: "reachable", reachable: true };
  return { ...base, status: configured ? "unreachable" : "not-configured", error: result.error };
}

function inventoryItem(
  env: Record<string, string | undefined>,
  item: Omit<RuntimeModelInventoryItem, "path" | "configured">,
): RuntimeModelInventoryItem {
  const path = env[item.envVar];
  return {
    ...item,
    path,
    configured: Boolean(path),
  };
}

export function runtimeModelInventory(env: Record<string, string | undefined> = process.env): RuntimeModelInventory {
  return {
    generatedAt: new Date().toISOString(),
    items: [
      inventoryItem(env, {
        id: "comfyui-models",
        runtimeId: "comfyui",
        kind: "model-directory",
        envVar: "COMFYUI_MODEL_DIR",
        purpose: "ComfyUI checkpoints, LoRAs, VAE, ControlNet, and video model folders.",
        installHint: "Keep ComfyUI models under the external runtime directory or set COMFYUI_MODEL_DIR to the active models folder.",
      }),
      inventoryItem(env, {
        id: "a1111-models",
        runtimeId: "a1111",
        kind: "model-directory",
        envVar: "A1111_MODEL_DIR",
        purpose: "AUTOMATIC1111 Stable Diffusion checkpoint and extension model folders.",
        installHint: "Keep A1111 models outside git and set A1111_MODEL_DIR when the WebUI uses a non-default models folder.",
      }),
      inventoryItem(env, {
        id: "piper-voice",
        runtimeId: "piper",
        kind: "voice-model",
        envVar: "PIPER_VOICE",
        purpose: "Local Piper voice model selected for zero-key narration.",
        installHint: "Download a Piper voice .onnx and matching config externally, then set PIPER_VOICE to the model path.",
      }),
      inventoryItem(env, {
        id: "whisper-model-cache",
        runtimeId: "faster-whisper",
        kind: "cache-directory",
        envVar: "WHISPER_CACHE_DIR",
        purpose: "Faster Whisper model cache for local transcription and sentence-safe shorts cuts.",
        installHint: "Set WHISPER_CACHE_DIR or HF_HOME to a user cache path; never commit downloaded speech models.",
      }),
      inventoryItem(env, {
        id: "transformers-cache",
        runtimeId: "transformersjs",
        kind: "package-cache",
        envVar: "HF_HOME",
        purpose: "Transformers.js CLIP/BLIP model cache for model-aware source understanding.",
        installHint: "Set HF_HOME or TRANSFORMERS_CACHE to an external cache path before enabling MONTARA_VISION_MODELS=1.",
      }),
      inventoryItem(env, {
        id: "rvm-checkpoint",
        runtimeId: "rvm",
        kind: "model-file",
        envVar: "MONTARA_RVM_CHECKPOINT",
        purpose: "Robust Video Matting checkpoint used for green-screen-free background removal.",
        installHint: "Run montara models plan first; only fetch the approved variant and keep the GPL-3.0 weights outside git.",
      }),
      inventoryItem(env, {
        id: "sam2-checkpoint",
        runtimeId: "sam2",
        kind: "model-file",
        envVar: "MONTARA_SAM2_CHECKPOINT",
        purpose: "SAM 2 checkpoint used for promptable masks and tracked rotoscoping.",
        installHint: "Run montara models plan to pick a tier this machine can run, then store the checkpoint outside the repo.",
      }),
      inventoryItem(env, {
        id: "yolo-weights",
        runtimeId: "yolo",
        kind: "model-file",
        envVar: "MONTARA_YOLO_WEIGHTS",
        purpose: "YOLO11 weights used for subject detection and auto-framing.",
        installHint: "AGPL-3.0 weights: keep them external and review Ultralytics licensing before commercial use.",
      }),
      inventoryItem(env, {
        id: "transformers-cache-legacy",
        runtimeId: "transformersjs",
        kind: "package-cache",
        envVar: "TRANSFORMERS_CACHE",
        purpose: "Alternate Transformers.js cache location used by some local setups.",
        installHint: "Prefer HF_HOME for new setups; keep all model cache paths outside the repo.",
      }),
    ],
    notes: [
      "This inventory reports configured paths only; it does not scan large model directories.",
      "Model files and voice weights remain external assets with their own licenses.",
      "Generated projects should record concrete model names and license/source cards beside final renders.",
    ],
  };
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
      "Montara invokes local generation runtimes over localhost APIs or external local commands/packages.",
      "No runtime source, model weights, or secrets are bundled in this repo.",
      "Unavailable runtimes must not block a video; fall back to local FFmpeg/design scenes or BYOK providers.",
    ],
  };
}
