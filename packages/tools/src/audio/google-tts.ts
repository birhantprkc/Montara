// @montara/tools/audio — Google Cloud Text-to-Speech connector.
// Request shape per the Google TTS REST API: POST {v1|v1beta1}/text:synthesize
// with either ?key=API_KEY or a Bearer token, and a JSON body of input/voice/audioConfig.
// Chirp 3 HD and Journey voices require the v1beta1 endpoint.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface GoogleTTSRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

const EXT_MAP: Record<string, string> = {
  MP3: "mp3",
  LINEAR16: "wav",
  OGG_OPUS: "ogg",
  MULAW: "wav",
  ALAW: "wav",
};

const BETA_VOICE_PREFIXES = ["Chirp", "Journey"];

export class GoogleTTS extends BaseTool {
  override name = "google_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "google_tts";
  override stability = "beta" as const;
  override executionMode = "sync" as const;
  override determinism = "deterministic" as const;
  override runtime = "api" as const;

  override installInstructions =
    "Auth option A — API key: set GOOGLE_API_KEY (or GEMINI_API_KEY) to a\n  Google Cloud API key with Text-to-Speech enabled.\n  Enable the API at https://console.cloud.google.com/apis/library/texttospeech.googleapis.com\nAuth option B — service account: set GOOGLE_APPLICATION_CREDENTIALS to the\n  path of a service-account JSON key (needs the 'google-auth' package).";
  override fallback = "openai_tts";
  override fallbackTools = ["openai_tts", "elevenlabs_tts", "piper_tts"];
  override agentSkills = ["text-to-speech"];

  override capabilities = ["text_to_speech", "voice_selection", "ssml_support", "multilingual"];
  override supports = { voice_cloning: false, multilingual: true, offline: false, native_audio: true, ssml: true };
  override bestFor = [
    "localization — 700+ voices across 50+ languages",
    "affordable high-quality TTS (Neural2, WaveNet)",
    "Google ecosystem integration",
  ];
  override notGoodFor = ["voice cloning", "fully offline production"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Text to convert to speech" },
      voice: { type: "string", default: "en-US-Chirp3-HD-Orus", description: "Voice name. Default tier is Chirp 3 HD." },
      language_code: { type: "string", default: "en-US", description: "BCP-47 language code (e.g. en-US, es-ES, ja-JP, fr-FR)" },
      speaking_rate: { type: "number", default: 1.0, minimum: 0.25, maximum: 4.0, description: "Speaking speed. 1.0 = normal." },
      pitch: { type: "number", default: 0.0, minimum: -20.0, maximum: 20.0, description: "Pitch adjustment in semitones." },
      audio_encoding: { type: "string", default: "MP3", enum: ["MP3", "LINEAR16", "OGG_OPUS", "MULAW", "ALAW"], description: "Audio output encoding format" },
      output_path: { type: "string" },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 1, ramMb: 256, vramMb: 0, diskMb: 50, networkRequired: true };
  override retryPolicy: RetryPolicy = { maxRetries: 2, backoffSeconds: 1, retryableErrors: ["rate_limit", "timeout"] };
  override idempotencyKeyFields = ["text", "voice", "language_code", "speaking_rate", "pitch"];
  override sideEffects = ["writes audio file to output_path", "calls Google Cloud TTS API"];
  override userVisibleVerification = ["Listen to generated audio for natural speech quality"];

  private getApiKey(secrets: Record<string, string | undefined>): string | undefined {
    return secrets.GOOGLE_API_KEY || secrets.GEMINI_API_KEY;
  }

  override getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    return this.getApiKey(secrets) ? "available" : "unavailable";
  }

  /** Whether a voice requires the v1beta1 endpoint (Chirp 3 HD, Journey). */
  needsBetaApi(voice: string): boolean {
    return BETA_VOICE_PREFIXES.some((prefix) => voice.includes(prefix));
  }

  override estimateCost(inputs: Record<string, unknown>): number {
    const text = typeof inputs.text === "string" ? inputs.text : "";
    const voice = typeof inputs.voice === "string" ? inputs.voice : "en-US-Chirp3-HD-Orus";
    let ratePerChar: number;
    if (voice.includes("Chirp3-HD")) ratePerChar = 0.000030;
    else if (voice.includes("Studio")) ratePerChar = 0.000160;
    else if (voice.includes("Neural2") || voice.includes("Journey")) ratePerChar = 0.000016;
    else if (voice.includes("WaveNet")) ratePerChar = 0.000016;
    else ratePerChar = 0.000004;
    return Math.round(text.length * ratePerChar * 10000) / 10000;
  }

  /** Pure result-data builder — mirrors the Google TTS success payload exactly. */
  resultData(inputs: Record<string, unknown>, output: string): Record<string, unknown> {
    const voiceName = typeof inputs.voice === "string" ? inputs.voice : "en-US-Chirp3-HD-Orus";
    const languageCode = typeof inputs.language_code === "string" ? inputs.language_code : "en-US";
    const audioEncoding = typeof inputs.audio_encoding === "string" ? inputs.audio_encoding : "MP3";
    return {
      provider: this.provider,
      voice: voiceName,
      language_code: languageCode,
      text_length: String(inputs.text ?? "").length,
      output,
      format: audioEncoding,
      speaking_rate: typeof inputs.speaking_rate === "number" ? inputs.speaking_rate : 1.0,
      pitch: typeof inputs.pitch === "number" ? inputs.pitch : 0.0,
    };
  }

  /** Pure request builder — mirrors the Google TTS REST endpoint exactly. */
  buildRequest(inputs: Record<string, unknown>, auth: { apiKey?: string; bearerToken?: string }): GoogleTTSRequest {
    const text = String(inputs.text ?? "");
    const voiceName = typeof inputs.voice === "string" ? inputs.voice : "en-US-Chirp3-HD-Orus";
    const languageCode = typeof inputs.language_code === "string" ? inputs.language_code : "en-US";
    const speakingRate = typeof inputs.speaking_rate === "number" ? inputs.speaking_rate : 1.0;
    const pitch = typeof inputs.pitch === "number" ? inputs.pitch : 0.0;
    const audioEncoding = typeof inputs.audio_encoding === "string" ? inputs.audio_encoding : "MP3";

    const payload = {
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding, speakingRate, pitch },
    };

    const apiVersion = this.needsBetaApi(voiceName) ? "v1beta1" : "v1";
    let url = `https://texttospeech.googleapis.com/${apiVersion}/text:synthesize`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth.bearerToken) {
      headers.Authorization = `Bearer ${auth.bearerToken}`;
    } else if (auth.apiKey) {
      url += `?key=${encodeURIComponent(auth.apiKey)}`;
    }

    return { method: "POST", url, headers, body: JSON.stringify(payload) };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = this.getApiKey(process.env);
    if (!apiKey) return toolResult({ success: false, error: `No Google credentials found. ${this.installInstructions}` });

    const start = Date.now();
    try {
      const req = this.buildRequest(inputs, { apiKey });
      const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      if (!resp.ok) return toolResult({ success: false, error: `Google TTS failed: HTTP ${resp.status}` });

      const json = (await resp.json()) as { audioContent?: string };
      const b64 = json.audioContent ?? "";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const audioEncoding = typeof inputs.audio_encoding === "string" ? inputs.audio_encoding : "MP3";
      const ext = EXT_MAP[audioEncoding] ?? "mp3";
      const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : `tts_output.${ext}`;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, bytes);

      const voiceName = typeof inputs.voice === "string" ? inputs.voice : "en-US-Chirp3-HD-Orus";
      const languageCode = typeof inputs.language_code === "string" ? inputs.language_code : "en-US";
      return toolResult({
        success: true,
        data: {
          provider: this.provider, voice: voiceName, language_code: languageCode,
          text_length: text(inputs), output: outputPath, format: audioEncoding,
          speaking_rate: typeof inputs.speaking_rate === "number" ? inputs.speaking_rate : 1.0,
          pitch: typeof inputs.pitch === "number" ? inputs.pitch : 0.0,
        },
        artifacts: [outputPath],
        model: `google-tts/${voiceName}`,
        costUsd: this.estimateCost(inputs),
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      return toolResult({ success: false, error: `Google TTS failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}

function text(inputs: Record<string, unknown>): number {
  return typeof inputs.text === "string" ? inputs.text.length : 0;
}
