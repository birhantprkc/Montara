// @montara/tools/audio — Doubao (Volcengine) Speech text-to-speech connector.
// Async flow: POST /api/v3/tts/submit -> poll /api/v3/tts/query until task_status==2
// -> download the returned audio_url. Mandarin narration with character-level timestamps.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface DoubaoSubmitRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

const SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/tts/submit";
const QUERY_URL = "https://openspeech.bytedance.com/api/v3/tts/query";
const DEFAULT_RESOURCE_ID = "seed-tts-2.0";
const DEFAULT_VOICE_ENV = "DOUBAO_SPEECH_VOICE_TYPE";

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), Math.round(seconds * 1000)));
}

export class DoubaoTTS extends BaseTool {
  override name = "doubao_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "doubao";
  override stability = "experimental" as const;
  override executionMode = "async" as const;
  override determinism = "stochastic" as const;
  override runtime = "api" as const;

  override installInstructions =
    "Set DOUBAO_SPEECH_API_KEY to a Volcengine Doubao Speech API Key.\nOptional: set DOUBAO_SPEECH_VOICE_TYPE to the default speaker voice.\nUse the new console API key flow; do not pass app id/access token as the API key.";
  override fallback = "google_tts";
  override fallbackTools = ["google_tts", "elevenlabs_tts", "openai_tts", "piper_tts"];
  override agentSkills = ["doubao-tts", "text-to-speech"];

  override capabilities = ["text_to_speech", "voice_selection", "multilingual", "timestamp_alignment"];
  override supports = {
    voice_cloning: false, multilingual: true, offline: false, native_audio: true,
    timestamps: true, long_text_async: true,
  };
  override bestFor = [
    "natural Mandarin narration",
    "Chinese explainer voiceovers with character-level timestamps",
    "long-form narration that needs subtitle alignment",
  ];
  override notGoodFor = ["fully offline production", "voice clone matching", "real-time interactive speech playback"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Text to convert to speech" },
      voice_id: { type: "string", description: "Doubao speaker/voice_type. Defaults to DOUBAO_SPEECH_VOICE_TYPE." },
      resource_id: { type: "string", default: "seed-tts-2.0", description: "Volcengine resource id. Use seed-tts-2.0 for Doubao Speech 2.0 voices." },
      format: { type: "string", default: "mp3", enum: ["mp3", "ogg_opus", "pcm"] },
      sample_rate: { type: "integer", default: 24000, enum: [8000, 16000, 22050, 24000, 32000, 44100, 48000] },
      speech_rate: { type: "integer", default: 0, minimum: -50, maximum: 100, description: "Doubao speech rate. 0=normal, 100=2x, -50=0.5x." },
      enable_timestamp: { type: "boolean", default: true, description: "Return sentence/word timing metadata when supported." },
      disable_markdown_filter: { type: "boolean", default: false, description: "Pass through Doubao markdown filtering behavior." },
      return_usage: { type: "boolean", default: true, description: "Request usage token data from Volcengine when available." },
      output_path: { type: "string" },
      metadata_path: { type: "string", description: "Where to save the full query JSON. Defaults next to output_path." },
      poll_interval_seconds: { type: "number", default: 2.0, minimum: 0.5 },
      timeout_seconds: { type: "integer", default: 300, minimum: 30 },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 1, ramMb: 256, vramMb: 0, diskMb: 50, networkRequired: true };
  override retryPolicy: RetryPolicy = {
    maxRetries: 2, backoffSeconds: 2.0,
    retryableErrors: ["timeout", "rate_limit", "quota exceeded for types: concurrency"],
  };
  override idempotencyKeyFields = ["text", "voice_id", "resource_id", "speech_rate", "sample_rate"];
  override sideEffects = [
    "writes audio file to output_path",
    "writes Doubao query metadata JSON next to output_path",
    "calls Volcengine Doubao Speech API",
  ];
  override userVisibleVerification = [
    "Listen to generated audio for Mandarin naturalness and pacing",
    "Check timestamp JSON before building subtitles",
  ];
  override qualityScore = 0.88;
  override latencyP50Seconds = 8.0;

  static readonly SUBMIT_URL = SUBMIT_URL;
  static readonly QUERY_URL = QUERY_URL;
  static readonly DEFAULT_RESOURCE_ID = DEFAULT_RESOURCE_ID;
  static readonly DEFAULT_VOICE_ENV = DEFAULT_VOICE_ENV;

  override getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    return secrets.DOUBAO_SPEECH_API_KEY ? "available" : "unavailable";
  }

  override estimateCost(inputs: Record<string, unknown>): number {
    const text = typeof inputs.text === "string" ? inputs.text : "";
    return Math.round(text.length * 0.000015 * 10000) / 10000;
  }

  extensionForFormat(fmt: string): string {
    if (fmt === "ogg_opus") return "ogg";
    if (fmt === "pcm") return "pcm";
    return "mp3";
  }

  buildHeaders(opts: { apiKey: string; resourceId: string; requestId: string; returnUsage: boolean }): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Api-Key": opts.apiKey,
      "X-Api-Resource-Id": opts.resourceId,
      "X-Api-Request-Id": opts.requestId,
      "Content-Type": "application/json",
    };
    if (opts.returnUsage) headers["X-Control-Require-Usage-Tokens-Return"] = "true";
    return headers;
  }

  /** Pure submit-body builder — mirrors the Volcengine submit payload exactly. */
  buildSubmitBody(inputs: Record<string, unknown>, voiceId: string, requestId: string): Record<string, unknown> {
    const audioParams = {
      format: typeof inputs.format === "string" ? inputs.format : "mp3",
      sample_rate: typeof inputs.sample_rate === "number" ? inputs.sample_rate : 24000,
      speech_rate: typeof inputs.speech_rate === "number" ? inputs.speech_rate : 0,
      enable_timestamp: inputs.enable_timestamp === undefined ? true : Boolean(inputs.enable_timestamp),
    };
    const additions = { disable_markdown_filter: Boolean(inputs.disable_markdown_filter ?? false) };
    return {
      user: { uid: typeof inputs.user_id === "string" ? inputs.user_id : "montara" },
      unique_id: requestId,
      req_params: {
        text: String(inputs.text ?? ""),
        speaker: voiceId,
        audio_params: audioParams,
        additions: JSON.stringify(additions),
      },
    };
  }

  /** Build the full submit request (headers + body). */
  buildSubmitRequest(inputs: Record<string, unknown>, opts: { apiKey: string; voiceId: string; requestId: string }): DoubaoSubmitRequest {
    const resourceId = typeof inputs.resource_id === "string" ? inputs.resource_id : DEFAULT_RESOURCE_ID;
    return {
      method: "POST",
      url: SUBMIT_URL,
      headers: this.buildHeaders({
        apiKey: opts.apiKey, resourceId, requestId: opts.requestId,
        returnUsage: inputs.return_usage === undefined ? true : Boolean(inputs.return_usage),
      }),
      body: JSON.stringify(this.buildSubmitBody(inputs, opts.voiceId, opts.requestId)),
    };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    const apiKey = process.env.DOUBAO_SPEECH_API_KEY;
    if (!apiKey) return toolResult({ success: false, error: `No Doubao Speech API key. ${this.installInstructions}` });

    const voiceId = (typeof inputs.voice_id === "string" && inputs.voice_id) || process.env[DEFAULT_VOICE_ENV];
    if (!voiceId) {
      return toolResult({ success: false, error: `No Doubao voice_id provided. Pass voice_id or set ${DEFAULT_VOICE_ENV} in the environment.` });
    }

    const start = Date.now();
    try {
      const resourceId = typeof inputs.resource_id === "string" ? inputs.resource_id : DEFAULT_RESOURCE_ID;
      const returnUsage = inputs.return_usage === undefined ? true : Boolean(inputs.return_usage);
      const reqId = uuidv4();
      const submitReq = this.buildSubmitRequest(inputs, { apiKey, voiceId, requestId: reqId });
      const submitResp = await fetch(submitReq.url, { method: submitReq.method, headers: submitReq.headers, body: submitReq.body });
      const submitData = (await submitResp.json()) as { data?: { task_id?: string } };
      const taskId = submitData.data?.task_id;
      if (!taskId) return toolResult({ success: false, error: "Doubao submit succeeded but did not return data.task_id" });

      const pollInterval = typeof inputs.poll_interval_seconds === "number" ? inputs.poll_interval_seconds : 2.0;
      const timeoutSeconds = typeof inputs.timeout_seconds === "number" ? inputs.timeout_seconds : 300;
      const deadline = Date.now() + timeoutSeconds * 1000;
      let queryData: { data?: Record<string, unknown> } | null = null;
      while (Date.now() < deadline) {
        await sleep(pollInterval);
        const headers = this.buildHeaders({ apiKey, resourceId, requestId: uuidv4(), returnUsage });
        const resp = await fetch(QUERY_URL, { method: "POST", headers, body: JSON.stringify({ task_id: taskId }) });
        const qd = (await resp.json()) as { data?: Record<string, unknown> };
        const status = qd.data?.task_status;
        if (status === 2) { queryData = qd; break; }
        if (status === 3) return toolResult({ success: false, error: "Doubao task failed" });
      }
      if (!queryData) return toolResult({ success: false, error: `Doubao task did not finish within ${timeoutSeconds} seconds` });

      const data = queryData.data ?? {};
      const audioUrl = typeof data.audio_url === "string" ? data.audio_url : "";
      if (!audioUrl) return toolResult({ success: false, error: "Doubao task completed but did not return data.audio_url" });

      const fmt = typeof inputs.format === "string" ? inputs.format : "mp3";
      const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : `doubao_tts.${this.extensionForFormat(fmt)}`;
      const metadataPath = typeof inputs.metadata_path === "string" ? inputs.metadata_path : `${outputPath}.json`;
      mkdirSync(dirname(outputPath), { recursive: true });
      const audioResp = await fetch(audioUrl);
      writeFileSync(outputPath, new Uint8Array(await audioResp.arrayBuffer()));
      writeFileSync(metadataPath, JSON.stringify(queryData, null, 2) + "\n");

      return toolResult({
        success: true,
        data: {
          provider: this.provider, model: resourceId, resource_id: resourceId, voice_id: voiceId,
          format: fmt, text_length: String(inputs.text ?? "").length, task_id: taskId,
          output: outputPath, metadata_path: metadataPath, sentences: data.sentences ?? [], usage: data.usage ?? null,
        },
        artifacts: [outputPath, metadataPath],
        model: resourceId,
        costUsd: this.estimateCost(inputs),
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      const safe = (err instanceof Error ? err.message : String(err)).replace(process.env.DOUBAO_SPEECH_API_KEY ?? "\0", "[redacted]");
      return toolResult({ success: false, error: `Doubao TTS failed: ${safe}` });
    }
  }
}
