// @montara/tools/audio — OpenAI text-to-speech connector.
// Request shape per the OpenAI audio API: POST /v1/audio/speech with a Bearer key
// and a JSON body {model, voice, input, response_format, instructions?, speed?}.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface OpenAITTSRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

export class OpenAITTS extends BaseTool {
  override name = "openai_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "openai";
  override stability = "experimental" as const;
  override executionMode = "sync" as const;
  override determinism = "stochastic" as const;
  override runtime = "api" as const;

  override installInstructions =
    "Set the OPENAI_API_KEY environment variable:\n  export OPENAI_API_KEY=your_key_here\nGet a key at https://platform.openai.com/";
  override fallback = "piper_tts";
  override fallbackTools = ["piper_tts"];
  override agentSkills = ["openai-docs"];

  override capabilities = ["text_to_speech", "voice_selection"];
  override supports = { voice_cloning: false, multilingual: true, offline: false, native_audio: true };
  override bestFor = ["general narration fallback", "API-based production when ElevenLabs is unavailable"];
  override notGoodFor = ["voice clone matching", "fully offline production"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      voice: { type: "string", default: "alloy", description: "OpenAI voice name" },
      model: { type: "string", default: "gpt-4o-mini-tts", description: "OpenAI speech model" },
      format: { type: "string", default: "mp3", enum: ["mp3", "wav", "pcm"] },
      instructions: { type: "string", description: "Optional delivery instructions for the voice" },
      output_path: { type: "string" },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 1, ramMb: 256, vramMb: 0, diskMb: 50, networkRequired: true };
  override retryPolicy: RetryPolicy = { maxRetries: 2, backoffSeconds: 1, retryableErrors: ["rate_limit", "timeout"] };
  override idempotencyKeyFields = ["text", "voice", "model", "format"];
  override sideEffects = ["writes audio file to output_path", "calls OpenAI API"];
  override userVisibleVerification = ["Listen to generated audio for intelligibility and tone"];

  override getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    return secrets.OPENAI_API_KEY ? "available" : "unavailable";
  }

  override estimateCost(inputs: Record<string, unknown>): number {
    const text = typeof inputs.text === "string" ? inputs.text : "";
    return Math.round(text.length * 0.000015 * 10000) / 10000;
  }

  /** Pure request builder — mirrors the OpenAI speech endpoint exactly. */
  buildRequest(inputs: Record<string, unknown>, apiKey: string): OpenAITTSRequest {
    const text = String(inputs.text ?? "");
    const model = typeof inputs.model === "string" ? inputs.model : "gpt-4o-mini-tts";
    const voice = typeof inputs.voice === "string" ? inputs.voice : "alloy";
    const fmt = typeof inputs.format === "string" ? inputs.format : "mp3";
    const body: Record<string, unknown> = { model, voice, input: text, response_format: fmt };
    if (typeof inputs.instructions === "string" && inputs.instructions) body.instructions = inputs.instructions;
    if (typeof inputs.speed === "number" && inputs.speed !== 1.0) body.speed = inputs.speed;
    return {
      method: "POST",
      url: "https://api.openai.com/v1/audio/speech",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return toolResult({ success: false, error: `No OpenAI API key. ${this.installInstructions}` });

    const start = Date.now();
    try {
      const req = this.buildRequest(inputs, apiKey);
      const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
      if (!resp.ok) return toolResult({ success: false, error: `OpenAI TTS failed: HTTP ${resp.status}` });

      const fmt = typeof inputs.format === "string" ? inputs.format : "mp3";
      const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : `openai_tts.${fmt}`;
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, new Uint8Array(await resp.arrayBuffer()));

      const model = typeof inputs.model === "string" ? inputs.model : "gpt-4o-mini-tts";
      const voice = typeof inputs.voice === "string" ? inputs.voice : "alloy";
      return toolResult({
        success: true,
        data: { provider: this.provider, model, voice, format: fmt, text_length: String(inputs.text ?? "").length, output: outputPath },
        artifacts: [outputPath],
        model,
        costUsd: this.estimateCost(inputs),
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      return toolResult({ success: false, error: `OpenAI TTS failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
