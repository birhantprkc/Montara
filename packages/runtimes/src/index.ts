// @montara/runtimes - external local runtime health and setup guidance.
//
// These runtimes are invoked over localhost APIs. Montara does not vendor their
// source or model weights; this package only reports health and safe setup steps.

export type RuntimeId = "comfyui" | "a1111";
export type RuntimeStatus = "reachable" | "configured" | "not-configured" | "unreachable";

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
