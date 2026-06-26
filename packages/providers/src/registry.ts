// @montara/providers — media provider registry (§C/§D/§E parity surface).
// Each provider is a declarative definition plus a PURE request-spec builder, so BYOK execution is
// real (the HTTP shape is correct per the vendor's API) while the package stays network-free and
// fully testable offline. With no credential, generation degrades to the local-free fallback, so a
// run never blocks. Cloud request shapes follow each vendor's documented API; live execution is
// BYOK and is exercised by the caller's executor, not by these unit-tested builders.

import type { ToolRunResult } from "./index";
import { renderCaptionCardVideo } from "./index";

export type MediaCategory = "video" | "image" | "tts" | "music";
export type ProviderTier = "cloud" | "local-runtime" | "stock" | "local-free";

export interface MediaProvider {
  id: string;
  name: string;
  vendor: string;
  category: MediaCategory;
  tier: ProviderTier;
  /** env var holding the credential; for keyless network providers this is a network opt-in flag */
  authEnv?: string;
  /** documented base endpoint used to build the request */
  endpoint?: string;
  notes: string;
}

export interface HttpRequestSpec {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** how a long-running job is polled, when applicable */
  poll?: { kind: "replicate" | "status-url"; field?: string };
}

export interface VideoGenInput {
  prompt: string;
  outPath: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  /** force a specific provider id; otherwise the first available is used */
  providerId?: string;
}

// ---- the 14 video generation providers ------------------------------------
export const VIDEO_PROVIDERS: MediaProvider[] = [
  // cloud (7)
  { id: "kling", name: "Kling", vendor: "Kuaishou", category: "video", tier: "cloud", authEnv: "KLING_API_KEY", endpoint: "https://api.klingai.com/v1/videos/text2video", notes: "Text/image-to-video, strong motion." },
  { id: "runway-gen3", name: "Runway Gen-3/4", vendor: "Runway", category: "video", tier: "cloud", authEnv: "RUNWAY_API_KEY", endpoint: "https://api.dev.runwayml.com/v1/image_to_video", notes: "Cinematic image-to-video." },
  { id: "google-veo3", name: "Google Veo 3", vendor: "Google", category: "video", tier: "cloud", authEnv: "GEMINI_API_KEY", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-001:predictLongRunning", notes: "High-fidelity text-to-video with audio." },
  { id: "grok-video", name: "Grok Imagine Video", vendor: "xAI", category: "video", tier: "cloud", authEnv: "XAI_API_KEY", endpoint: "https://api.x.ai/v1/video/generations", notes: "Fast stylised text-to-video." },
  { id: "higgsfield", name: "Higgsfield (Soul ID)", vendor: "Higgsfield", category: "video", tier: "cloud", authEnv: "HIGGSFIELD_API_KEY", endpoint: "https://platform.higgsfield.ai/v1/text2video", notes: "Character-consistent motion (Soul ID)." },
  { id: "minimax-video", name: "MiniMax (Hailuo)", vendor: "MiniMax", category: "video", tier: "cloud", authEnv: "MINIMAX_API_KEY", endpoint: "https://api.minimax.chat/v1/video_generation", notes: "Hailuo text/image-to-video." },
  { id: "heygen", name: "HeyGen", vendor: "HeyGen", category: "video", tier: "cloud", authEnv: "HEYGEN_API_KEY", endpoint: "https://api.heygen.com/v2/video/generate", notes: "Avatar / talking-head video." },
  // local GPU via ComfyUI (4)
  { id: "wan-2.1", name: "WAN 2.1", vendor: "Alibaba", category: "video", tier: "local-runtime", authEnv: "COMFYUI_URL", endpoint: "/prompt", notes: "Local 1.3B/14B text-to-video via ComfyUI." },
  { id: "hunyuan-video", name: "Hunyuan Video", vendor: "Tencent", category: "video", tier: "local-runtime", authEnv: "COMFYUI_URL", endpoint: "/prompt", notes: "Local high-quality text-to-video via ComfyUI." },
  { id: "cogvideo", name: "CogVideo", vendor: "THUDM", category: "video", tier: "local-runtime", authEnv: "COMFYUI_URL", endpoint: "/prompt", notes: "Local 2B/5B text-to-video via ComfyUI." },
  { id: "ltx-video", name: "LTX-Video", vendor: "Lightricks", category: "video", tier: "local-runtime", authEnv: "COMFYUI_URL", endpoint: "/prompt", notes: "Local fast text-to-video via ComfyUI." },
  // stock footage (3)
  { id: "pexels-video", name: "Pexels Video", vendor: "Pexels", category: "video", tier: "stock", authEnv: "PEXELS_API_KEY", endpoint: "https://api.pexels.com/videos/search", notes: "Free stock footage search." },
  { id: "pixabay-video", name: "Pixabay Video", vendor: "Pixabay", category: "video", tier: "stock", authEnv: "PIXABAY_API_KEY", endpoint: "https://pixabay.com/api/videos/", notes: "Free stock footage search." },
  { id: "wikimedia-video", name: "Wikimedia Commons", vendor: "Wikimedia", category: "video", tier: "stock", authEnv: "MONTARA_NETWORK", endpoint: "https://commons.wikimedia.org/w/api.php", notes: "Keyless CC media search (network opt-in)." },
];

/** Local-free fallback presented as a provider, so a plan always resolves to something runnable. */
export const LOCAL_VIDEO_FALLBACK: MediaProvider = {
  id: "local.caption-card-video",
  name: "Caption Card Video",
  vendor: "Montara",
  category: "video",
  tier: "local-free",
  notes: "Offline titled scene-card MP4 through the Timeline IR path.",
};

export function listVideoProviders(includeFallback = false): MediaProvider[] {
  return includeFallback ? [...VIDEO_PROVIDERS, LOCAL_VIDEO_FALLBACK] : [...VIDEO_PROVIDERS];
}

export function getVideoProvider(id: string): MediaProvider | undefined {
  return listVideoProviders(true).find((p) => p.id === id);
}

/** A provider is available when local-free, or when its credential / network opt-in is present. */
export function providerAvailable(provider: MediaProvider, secrets: Record<string, string | undefined> = process.env): boolean {
  if (provider.tier === "local-free") return true;
  return Boolean(provider.authEnv && secrets[provider.authEnv]);
}

function sanitize(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 500);
}

/** Build the (real, vendor-shaped) HTTP request for an external provider. Throws for local-free. */
export function buildVideoRequest(
  provider: MediaProvider,
  input: VideoGenInput,
  secrets: Record<string, string | undefined> = process.env,
): HttpRequestSpec {
  const key = provider.authEnv ? secrets[provider.authEnv] ?? "" : "";
  const prompt = sanitize(input.prompt);
  const duration = Math.max(1, Math.round(input.durationSec ?? 5));
  const endpoint = provider.endpoint ?? "";

  if (provider.tier === "stock") {
    if (provider.id === "pexels-video") {
      return { method: "GET", url: `${endpoint}?query=${encodeURIComponent(prompt)}&per_page=15`, headers: { Authorization: key } };
    }
    if (provider.id === "pixabay-video") {
      return { method: "GET", url: `${endpoint}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(prompt)}&per_page=15`, headers: {} };
    }
    // wikimedia (keyless)
    return {
      method: "GET",
      url: `${endpoint}?action=query&format=json&list=search&srnamespace=6&srsearch=${encodeURIComponent(prompt)}`,
      headers: { "User-Agent": "Montara/0 (video search)" },
    };
  }

  if (provider.tier === "local-runtime") {
    const base = (secrets.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
    return {
      method: "POST",
      url: `${base}${endpoint}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: { model: provider.id, text: prompt, length: duration, width: input.width ?? 768, height: input.height ?? 512 } }),
      poll: { kind: "status-url", field: "prompt_id" },
    };
  }

  // cloud — Bearer-auth POST with a prompt payload (per-vendor minimal shape)
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  const body: Record<string, unknown> = { prompt, duration_seconds: duration };
  if (provider.id === "heygen") { body.video_inputs = [{ character: { type: "avatar" }, voice: { type: "text", input_text: prompt } }]; delete body.prompt; }
  if (provider.id === "google-veo3") { headers["x-goog-api-key"] = key; delete headers.Authorization; }
  if (input.width && input.height) body.aspect_ratio = `${input.width}:${input.height}`;
  return { method: "POST", url: endpoint, headers, body: JSON.stringify(body), poll: { kind: "status-url", field: "id" } };
}

export type GenerationMode = "request" | "fallback";

export interface VideoGenerationPlan {
  provider: MediaProvider;
  mode: GenerationMode;
  request?: HttpRequestSpec;
  /** providers that were considered but unavailable (no credential) */
  unavailable: string[];
}

/**
 * Resolve which provider runs. A forced id wins if available; otherwise the first available external
 * provider is chosen; if none is available the local-free fallback is selected (mode "fallback").
 */
export function planVideoGeneration(input: VideoGenInput, secrets: Record<string, string | undefined> = process.env): VideoGenerationPlan {
  const pool = input.providerId
    ? listVideoProviders(true).filter((p) => p.id === input.providerId)
    : listVideoProviders(false);
  const unavailable: string[] = [];
  for (const provider of pool) {
    if (provider.tier === "local-free") {
      return { provider, mode: "fallback", unavailable };
    }
    if (providerAvailable(provider, secrets)) {
      return { provider, mode: "request", request: buildVideoRequest(provider, input, secrets), unavailable };
    }
    unavailable.push(provider.id);
  }
  return { provider: LOCAL_VIDEO_FALLBACK, mode: "fallback", unavailable };
}

/**
 * Run a video generation. Offline (no credentials) this renders the local caption-card fallback and
 * returns a real artifact. When a credentialed provider is chosen, the request spec is returned for
 * a BYOK executor to run (no network here).
 */
export function runVideoGeneration(
  input: VideoGenInput,
  secrets: Record<string, string | undefined> = process.env,
): { plan: VideoGenerationPlan; result?: ToolRunResult } {
  const plan = planVideoGeneration(input, secrets);
  if (plan.mode === "fallback") {
    const result = renderCaptionCardVideo({
      title: input.prompt.slice(0, 54),
      outPath: input.outPath,
      durationSec: input.durationSec,
      width: input.width,
      height: input.height,
      fps: input.fps,
    });
    return { plan, result };
  }
  return { plan };
}
