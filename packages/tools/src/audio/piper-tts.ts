// @montara/tools/audio — Piper local text-to-speech connector.
// Local CLI tool: shells out to `piper` reading text from stdin and writing a WAV.
// No network, no key — the offline narration fallback.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, commandExists, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface PiperCommand {
  bin: string;
  args: string[];
  stdin: string;
}

export class PiperTTS extends BaseTool {
  override name = "piper_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "piper";
  override stability = "experimental" as const;
  override executionMode = "sync" as const;
  override determinism = "deterministic" as const;
  override runtime = "local" as const;

  override dependencies = ["cmd:piper"];
  override installInstructions =
    "Install Piper TTS:\n  pip install piper-tts\nOr download from https://github.com/rhasspy/piper/releases\nThen download a voice model:\n  piper --download-dir ~/.piper/models --model en_US-lessac-medium";
  override agentSkills = ["text-to-speech"];

  override capabilities = ["text_to_speech", "offline_generation"];
  override supports = { voice_cloning: false, multilingual: false, offline: true, native_audio: true };
  override bestFor = ["offline narration fallback", "privacy-sensitive local-only workflows"];
  override notGoodFor = ["best-in-class expressive voice quality", "voice clone matching"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      model: { type: "string", default: "en_US-lessac-medium" },
      speaker_id: { type: "integer", default: 0 },
      length_scale: { type: "number", default: 1.0 },
      sentence_silence: { type: "number", default: 0.3 },
      output_path: { type: "string" },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 2, ramMb: 512, vramMb: 0, diskMb: 200, networkRequired: false };
  override retryPolicy: RetryPolicy = { maxRetries: 1, backoffSeconds: 0, retryableErrors: [] };
  override idempotencyKeyFields = ["text", "model", "speaker_id", "length_scale"];
  override sideEffects = ["writes audio file to output_path"];
  override userVisibleVerification = ["Listen to generated audio for intelligibility"];

  override getStatus(): ToolStatus {
    return commandExists("piper") ? "available" : "unavailable";
  }

  override estimateCost(_inputs: Record<string, unknown>): number {
    return 0.0;
  }

  /** Pure command builder — mirrors the piper CLI invocation exactly. */
  buildCommand(inputs: Record<string, unknown>): PiperCommand {
    const model = typeof inputs.model === "string" ? inputs.model : "en_US-lessac-medium";
    const speakerId = typeof inputs.speaker_id === "number" ? inputs.speaker_id : 0;
    const lengthScale = typeof inputs.length_scale === "number" ? inputs.length_scale : 1.0;
    const sentenceSilence = typeof inputs.sentence_silence === "number" ? inputs.sentence_silence : 0.3;
    const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : "tts_output.wav";
    return {
      bin: "piper",
      args: [
        "--model", model,
        "--speaker", String(speakerId),
        "--length-scale", String(lengthScale),
        "--sentence-silence", String(sentenceSilence),
        "--output_file", outputPath,
      ],
      stdin: String(inputs.text ?? ""),
    };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    if (this.getStatus() !== "available") {
      return toolResult({ success: false, error: `Piper TTS not available. ${this.installInstructions}` });
    }
    const start = Date.now();
    try {
      const cmd = this.buildCommand(inputs);
      const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : "tts_output.wav";
      mkdirSync(dirname(outputPath), { recursive: true });
      const proc = spawnSync(cmd.bin, cmd.args, { input: cmd.stdin, encoding: "utf8" });
      if (proc.status !== 0) {
        return toolResult({ success: false, error: `Piper failed (exit ${proc.status}): ${proc.stderr ?? ""}` });
      }
      if (!existsSync(outputPath)) {
        return toolResult({ success: false, error: `Piper output file missing: ${outputPath}` });
      }
      const model = typeof inputs.model === "string" ? inputs.model : "en_US-lessac-medium";
      return toolResult({
        success: true,
        data: {
          provider: this.provider, model,
          speaker_id: typeof inputs.speaker_id === "number" ? inputs.speaker_id : 0,
          text_length: String(inputs.text ?? "").length, output: outputPath, format: "wav",
        },
        artifacts: [outputPath],
        model,
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      return toolResult({ success: false, error: `Local TTS generation failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
