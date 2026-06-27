// @montara/providers — media provider registry (§C/§D/§E parity surface).
// Each provider is a declarative definition plus a PURE request-spec builder, so BYOK execution is
// real (the HTTP shape is correct per the vendor's API) while the package stays network-free and
// fully testable offline. With no credential, generation degrades to the local-free fallback, so a
// run never blocks. Cloud request shapes follow each vendor's documented API; live execution is
// BYOK and is exercised by the caller's executor, not by these unit-tested builders.

import type { ToolRunResult } from "./index";
import { renderCaptionCardVideo, renderCaptionCardImage, generateSilentVoice, generateToneScore } from "./index";

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

// ---- the 10 image generation providers ------------------------------------
export interface ImageGenInput {
  prompt: string;
  outPath: string;
  width?: number;
  height?: number;
  providerId?: string;
}

export const IMAGE_PROVIDERS: MediaProvider[] = [
  // cloud (5)
  { id: "flux", name: "FLUX", vendor: "Black Forest Labs", category: "image", tier: "cloud", authEnv: "BFL_API_KEY", endpoint: "https://api.bfl.ai/v1/flux-pro-1.1", notes: "High-quality text-to-image." },
  { id: "imagen", name: "Google Imagen", vendor: "Google", category: "image", tier: "cloud", authEnv: "GEMINI_API_KEY", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict", notes: "Photoreal text-to-image." },
  { id: "grok-image", name: "Grok Imagine Image", vendor: "xAI", category: "image", tier: "cloud", authEnv: "XAI_API_KEY", endpoint: "https://api.x.ai/v1/images/generations", notes: "Stylised text-to-image." },
  { id: "dalle3", name: "DALL·E 3", vendor: "OpenAI", category: "image", tier: "cloud", authEnv: "OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/images/generations", notes: "Text-to-image with strong prompt following." },
  { id: "recraft", name: "Recraft", vendor: "Recraft", category: "image", tier: "cloud", authEnv: "RECRAFT_API_KEY", endpoint: "https://external.api.recraft.ai/v1/images/generations", notes: "Vector / brand-style image generation." },
  // local GPU (2)
  { id: "stable-diffusion", name: "Stable Diffusion", vendor: "Stability", category: "image", tier: "local-runtime", authEnv: "COMFYUI_URL", endpoint: "/prompt", notes: "Local SD/SDXL/FLUX via ComfyUI or A1111." },
  { id: "manim-ce", name: "ManimCE", vendor: "Manim", category: "image", tier: "local-runtime", authEnv: "MANIM_BIN", endpoint: "manim", notes: "Local programmatic diagram/figure frames." },
  // stock (3)
  { id: "pexels-image", name: "Pexels Photos", vendor: "Pexels", category: "image", tier: "stock", authEnv: "PEXELS_API_KEY", endpoint: "https://api.pexels.com/v1/search", notes: "Free stock photo search." },
  { id: "pixabay-image", name: "Pixabay Photos", vendor: "Pixabay", category: "image", tier: "stock", authEnv: "PIXABAY_API_KEY", endpoint: "https://pixabay.com/api/", notes: "Free stock photo search." },
  { id: "unsplash", name: "Unsplash", vendor: "Unsplash", category: "image", tier: "stock", authEnv: "UNSPLASH_ACCESS_KEY", endpoint: "https://api.unsplash.com/search/photos", notes: "Free stock photo search." },
];

export const LOCAL_IMAGE_FALLBACK: MediaProvider = {
  id: "local.caption-card-image",
  name: "Caption Card Image",
  vendor: "Montara",
  category: "image",
  tier: "local-free",
  notes: "Offline designed solid-card PNG for missing imagery.",
};

export function listImageProviders(includeFallback = false): MediaProvider[] {
  return includeFallback ? [...IMAGE_PROVIDERS, LOCAL_IMAGE_FALLBACK] : [...IMAGE_PROVIDERS];
}

export function getImageProvider(id: string): MediaProvider | undefined {
  return listImageProviders(true).find((p) => p.id === id);
}

export function buildImageRequest(
  provider: MediaProvider,
  input: ImageGenInput,
  secrets: Record<string, string | undefined> = process.env,
): HttpRequestSpec {
  const key = provider.authEnv ? secrets[provider.authEnv] ?? "" : "";
  const prompt = sanitize(input.prompt);
  const size = `${input.width ?? 1024}x${input.height ?? 1024}`;
  const endpoint = provider.endpoint ?? "";

  if (provider.tier === "stock") {
    if (provider.id === "unsplash") {
      return { method: "GET", url: `${endpoint}?query=${encodeURIComponent(prompt)}&per_page=15`, headers: { Authorization: `Client-ID ${key}` } };
    }
    if (provider.id === "pixabay-image") {
      return { method: "GET", url: `${endpoint}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(prompt)}&per_page=15`, headers: {} };
    }
    // pexels
    return { method: "GET", url: `${endpoint}?query=${encodeURIComponent(prompt)}&per_page=15`, headers: { Authorization: key } };
  }

  if (provider.tier === "local-runtime") {
    if (provider.id === "manim-ce") {
      return { method: "POST", url: "local://manim", headers: {}, body: JSON.stringify({ bin: secrets.MANIM_BIN ?? "manim", prompt }) };
    }
    const base = (secrets.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
    return {
      method: "POST",
      url: `${base}${endpoint}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: { model: provider.id, text: prompt, width: input.width ?? 1024, height: input.height ?? 1024 } }),
      poll: { kind: "status-url", field: "prompt_id" },
    };
  }

  // cloud
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  const body: Record<string, unknown> = { prompt, size };
  if (provider.id === "dalle3") body.model = "dall-e-3";
  if (provider.id === "imagen") { headers["x-goog-api-key"] = key; delete headers.Authorization; }
  return { method: "POST", url: endpoint, headers, body: JSON.stringify(body) };
}

export interface ImageGenerationPlan {
  provider: MediaProvider;
  mode: GenerationMode;
  request?: HttpRequestSpec;
  unavailable: string[];
}

export function planImageGeneration(input: ImageGenInput, secrets: Record<string, string | undefined> = process.env): ImageGenerationPlan {
  const pool = input.providerId
    ? listImageProviders(true).filter((p) => p.id === input.providerId)
    : listImageProviders(false);
  const unavailable: string[] = [];
  for (const provider of pool) {
    if (provider.tier === "local-free") return { provider, mode: "fallback", unavailable };
    if (providerAvailable(provider, secrets)) {
      return { provider, mode: "request", request: buildImageRequest(provider, input, secrets), unavailable };
    }
    unavailable.push(provider.id);
  }
  return { provider: LOCAL_IMAGE_FALLBACK, mode: "fallback", unavailable };
}

export function runImageGeneration(
  input: ImageGenInput,
  secrets: Record<string, string | undefined> = process.env,
): { plan: ImageGenerationPlan; result?: ToolRunResult } {
  const plan = planImageGeneration(input, secrets);
  if (plan.mode === "fallback") {
    const result = renderCaptionCardImage({
      title: input.prompt.slice(0, 54),
      outPath: input.outPath,
      width: input.width,
      height: input.height,
    });
    return { plan, result };
  }
  return { plan };
}

// ---- speech (TTS) providers -----------------------------------------------
export interface SpeechGenInput {
  text: string;
  outPath: string;
  voice?: string;
  durationSec?: number;
  providerId?: string;
}

export const TTS_PROVIDERS: MediaProvider[] = [
  { id: "elevenlabs-tts", name: "ElevenLabs TTS", vendor: "ElevenLabs", category: "tts", tier: "cloud", authEnv: "ELEVENLABS_API_KEY", endpoint: "https://api.elevenlabs.io/v1/text-to-speech", notes: "High-fidelity expressive voices." },
  { id: "google-tts", name: "Google TTS", vendor: "Google", category: "tts", tier: "cloud", authEnv: "GOOGLE_TTS_API_KEY", endpoint: "https://texttospeech.googleapis.com/v1/text:synthesize", notes: "WaveNet/Neural2 voices." },
  { id: "openai-tts", name: "OpenAI TTS", vendor: "OpenAI", category: "tts", tier: "cloud", authEnv: "OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/audio/speech", notes: "Natural multi-voice speech." },
  { id: "piper", name: "Piper", vendor: "Rhasspy", category: "tts", tier: "local-runtime", authEnv: "PIPER_BIN", endpoint: "piper", notes: "Local, free, offline neural TTS." },
];

export const LOCAL_TTS_FALLBACK: MediaProvider = {
  id: "local.silent-voice",
  name: "Silent Voice Bed",
  vendor: "Montara",
  category: "tts",
  tier: "local-free",
  notes: "Offline silent PCM placeholder that preserves timing.",
};

// ---- music / SFX providers ------------------------------------------------
export interface MusicGenInput {
  prompt: string;
  outPath: string;
  durationSec?: number;
  providerId?: string;
}

export const MUSIC_PROVIDERS: MediaProvider[] = [
  { id: "suno", name: "Suno", vendor: "Suno", category: "music", tier: "cloud", authEnv: "SUNO_API_KEY", endpoint: "https://studio-api.suno.ai/api/generate/v2/", notes: "Full songs from a prompt." },
  { id: "elevenlabs-music", name: "ElevenLabs Music", vendor: "ElevenLabs", category: "music", tier: "cloud", authEnv: "ELEVENLABS_API_KEY", endpoint: "https://api.elevenlabs.io/v1/music", notes: "Prompted instrumental score." },
  { id: "elevenlabs-sfx", name: "ElevenLabs SFX", vendor: "ElevenLabs", category: "music", tier: "cloud", authEnv: "ELEVENLABS_API_KEY", endpoint: "https://api.elevenlabs.io/v1/sound-generation", notes: "Prompted sound effects." },
];

export const LOCAL_MUSIC_FALLBACK: MediaProvider = {
  id: "local.tone-score",
  name: "Tone Score",
  vendor: "Montara",
  category: "music",
  tier: "local-free",
  notes: "Offline quiet generated tone bed for timing.",
};

export function listTtsProviders(includeFallback = false): MediaProvider[] {
  return includeFallback ? [...TTS_PROVIDERS, LOCAL_TTS_FALLBACK] : [...TTS_PROVIDERS];
}

export function listMusicProviders(includeFallback = false): MediaProvider[] {
  return includeFallback ? [...MUSIC_PROVIDERS, LOCAL_MUSIC_FALLBACK] : [...MUSIC_PROVIDERS];
}

export function getTtsProvider(id: string): MediaProvider | undefined {
  return listTtsProviders(true).find((p) => p.id === id);
}

export function getMusicProvider(id: string): MediaProvider | undefined {
  return listMusicProviders(true).find((p) => p.id === id);
}

export function buildTtsRequest(
  provider: MediaProvider,
  input: SpeechGenInput,
  secrets: Record<string, string | undefined> = process.env,
): HttpRequestSpec {
  const key = provider.authEnv ? secrets[provider.authEnv] ?? "" : "";
  const text = input.text.slice(0, 5000);
  const endpoint = provider.endpoint ?? "";

  if (provider.id === "elevenlabs-tts") {
    const voice = input.voice ?? "21m00Tcm4TlvDq8ikWAM";
    return { method: "POST", url: `${endpoint}/${voice}`, headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }) };
  }
  if (provider.id === "google-tts") {
    return { method: "POST", url: `${endpoint}?key=${encodeURIComponent(key)}`, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: { text }, voice: { languageCode: "en-US" }, audioConfig: { audioEncoding: "MP3" } }) };
  }
  if (provider.id === "openai-tts") {
    return { method: "POST", url: endpoint, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "tts-1", input: text, voice: input.voice ?? "alloy" }) };
  }
  // piper (local)
  return { method: "POST", url: "local://piper", headers: {}, body: JSON.stringify({ bin: secrets.PIPER_BIN ?? "piper", text, voice: input.voice ?? "en_US-amy-medium" }) };
}

export function buildMusicRequest(
  provider: MediaProvider,
  input: MusicGenInput,
  secrets: Record<string, string | undefined> = process.env,
): HttpRequestSpec {
  const key = provider.authEnv ? secrets[provider.authEnv] ?? "" : "";
  const prompt = sanitize(input.prompt);
  const duration = Math.max(1, Math.round(input.durationSec ?? 10));
  const endpoint = provider.endpoint ?? "";

  if (provider.id === "suno") {
    return { method: "POST", url: endpoint, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, make_instrumental: true }) };
  }
  if (provider.id === "elevenlabs-sfx") {
    return { method: "POST", url: endpoint, headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text: prompt, duration_seconds: duration }) };
  }
  // elevenlabs-music
  return { method: "POST", url: endpoint, headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ prompt, music_length_ms: duration * 1000 }) };
}

export interface AudioGenerationPlan {
  provider: MediaProvider;
  mode: GenerationMode;
  request?: HttpRequestSpec;
  unavailable: string[];
}

export function planSpeechGeneration(input: SpeechGenInput, secrets: Record<string, string | undefined> = process.env): AudioGenerationPlan {
  const pool = input.providerId ? listTtsProviders(true).filter((p) => p.id === input.providerId) : listTtsProviders(false);
  const unavailable: string[] = [];
  for (const provider of pool) {
    if (provider.tier === "local-free") return { provider, mode: "fallback", unavailable };
    if (providerAvailable(provider, secrets)) return { provider, mode: "request", request: buildTtsRequest(provider, input, secrets), unavailable };
    unavailable.push(provider.id);
  }
  return { provider: LOCAL_TTS_FALLBACK, mode: "fallback", unavailable };
}

export function planMusicGeneration(input: MusicGenInput, secrets: Record<string, string | undefined> = process.env): AudioGenerationPlan {
  const pool = input.providerId ? listMusicProviders(true).filter((p) => p.id === input.providerId) : listMusicProviders(false);
  const unavailable: string[] = [];
  for (const provider of pool) {
    if (provider.tier === "local-free") return { provider, mode: "fallback", unavailable };
    if (providerAvailable(provider, secrets)) return { provider, mode: "request", request: buildMusicRequest(provider, input, secrets), unavailable };
    unavailable.push(provider.id);
  }
  return { provider: LOCAL_MUSIC_FALLBACK, mode: "fallback", unavailable };
}

export function runSpeechGeneration(
  input: SpeechGenInput,
  secrets: Record<string, string | undefined> = process.env,
): { plan: AudioGenerationPlan; result?: ToolRunResult } {
  const plan = planSpeechGeneration(input, secrets);
  if (plan.mode === "fallback") {
    return { plan, result: generateSilentVoice({ text: input.text, outPath: input.outPath, durationSec: input.durationSec }) };
  }
  return { plan };
}

export function runMusicGeneration(
  input: MusicGenInput,
  secrets: Record<string, string | undefined> = process.env,
): { plan: AudioGenerationPlan; result?: ToolRunResult } {
  const plan = planMusicGeneration(input, secrets);
  if (plan.mode === "fallback") {
    return { plan, result: generateToneScore({ outPath: input.outPath, durationSec: input.durationSec }) };
  }
  return { plan };
}
