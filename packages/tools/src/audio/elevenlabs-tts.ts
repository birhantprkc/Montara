// @montara/tools/audio — ElevenLabs TTS connector.
// Request shape per the ElevenLabs API: POST /v1/text-to-speech/{voice_id} with the
// xi-api-key + Accept: audio/mpeg headers, a voice_settings body, and an output_format query param.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface ElevenLabsRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

export class ElevenLabsTTS extends BaseTool {
  override name = "elevenlabs_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "elevenlabs";
  override stability = "experimental" as const;
  override determinism = "stochastic" as const;
  override runtime = "api" as const;

  override installInstructions =
    "Set the ELEVENLABS_API_KEY environment variable. Get a key at https://elevenlabs.io";
  override fallback = "openai_tts";
  override fallbackTools = ["openai_tts", "piper_tts"];
  override agentSkills = ["elevenlabs", "text-to-speech"];
  override capabilities = ["text_to_speech", "voice_selection", "ssml_support", "pronunciation_control"];
  override supports = { voice_cloning: true, multilingual: true, offline: false, native_audio: true };
  override bestFor = ["high-quality narration", "voice-sensitive spokesperson videos", "multilingual spoken delivery"];
  override notGoodFor = ["fully offline production", "privacy-constrained local-only workflows"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Text to convert to speech" },
      voice_id: { type: "string", description: "ElevenLabs voice ID (default: Rachel)" },
      model_id: { type: "string", default: "eleven_multilingual_v2" },
      stability: { type: "number", default: 0.5, minimum: 0, maximum: 1 },
      similarity_boost: { type: "number", default: 0.75, minimum: 0, maximum: 1 },
      style: { type: "number", default: 0.0, minimum: 0, maximum: 1 },
      output_path: { type: "string" },
      output_format: { type: "string", default: "mp3_44100_128", enum: ["mp3_44100_128", "mp3_44100_192", "pcm_16000", "pcm_24000"] },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 1, ramMb: 256, vramMb: 0, diskMb: 50, networkRequired: true };
  override retryPolicy: RetryPolicy = { maxRetries: 2, backoffSeconds: 1, retryableErrors: ["rate_limit", "timeout"] };
  override idempotencyKeyFields = ["text", "voice_id", "model_id"];
  override sideEffects = ["writes audio file to output_path", "calls ElevenLabs API"];
  override userVisibleVerification = ["Listen to generated audio for natural speech quality"];

  static readonly DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

  override getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    return secrets.ELEVENLABS_API_KEY ? "available" : "unavailable";
  }

  override estimateCost(inputs: Record<string, unknown>): number {
    const text = typeof inputs.text === "string" ? inputs.text : "";
    return Math.round(text.length * 0.0003 * 10000) / 10000;
  }

  /** Pure request builder — mirrors the ElevenLabs API exactly; unit-tested for fidelity. */
  buildRequest(inputs: Record<string, unknown>, apiKey: string): ElevenLabsRequest {
    const text = String(inputs.text ?? "");
    const voiceId = typeof inputs.voice_id === "string" ? inputs.voice_id : ElevenLabsTTS.DEFAULT_VOICE_ID;
    const modelId = typeof inputs.model_id === "string" ? inputs.model_id : "eleven_multilingual_v2";
    const outputFormat = typeof inputs.output_format === "string" ? inputs.output_format : "mp3_44100_128";
    const numOr = (v: unknown, d: number): number => (typeof v === "number" ? v : d);
    return {
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`,
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: numOr(inputs.stability, 0.5),
          similarity_boost: numOr(inputs.similarity_boost, 0.75),
          style: numOr(inputs.style, 0.0),
        },
      }),
    };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return toolResult({ success: false, error: `No ElevenLabs API key. ${this.installInstructions}` });

    const start = Date.now();
    try {
      const req = this.buildRequest(inputs, apiKey);
      const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      if (!resp.ok) return toolResult({ success: false, error: `ElevenLabs API error ${resp.status}` });

      const outputFormat = typeof inputs.output_format === "string" ? inputs.output_format : "mp3_44100_128";
      const ext = outputFormat.includes("mp3") ? "mp3" : "wav";
      const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : `tts_output.${ext}`;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, new Uint8Array(await resp.arrayBuffer()));

      const modelId = typeof inputs.model_id === "string" ? inputs.model_id : "eleven_multilingual_v2";
      return toolResult({
        success: true,
        data: { provider: this.provider, model: modelId, output: outputPath, format: outputFormat, textLength: String(inputs.text ?? "").length },
        artifacts: [outputPath],
        model: modelId,
        costUsd: this.estimateCost(inputs),
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      return toolResult({ success: false, error: `TTS generation failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
