// @montara/tools/audio — System (OS built-in) text-to-speech connector.
// The zero-key, zero-install default voice: Windows SAPI (System.Speech, ships with .NET),
// macOS `say`, Linux `espeak-ng`/`espeak`. When no cloud TTS key is set and Piper isn't
// installed, this keeps the "make a video with no API keys" promise true for narration.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BaseTool, commandExists, toolResult, type ResourceProfile, type RetryPolicy, type ToolResult, type ToolStatus } from "../base";

export interface SystemTTSCommand {
  bin: string;
  args: string[];
  outputPath: string;
  format: "wav";
}

function psEscape(text: string): string {
  return text.replace(/'/g, "''");
}

export class SystemTTS extends BaseTool {
  override name = "system_tts";
  override version = "0.1.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "system";
  override stability = "beta" as const;
  override executionMode = "sync" as const;
  override determinism = "deterministic" as const;
  override runtime = "local" as const;

  override installInstructions =
    "Uses the operating-system voice — no key, no install on Windows (SAPI) or macOS (say).\n" +
    "On Linux, install a voice: apt-get install espeak-ng";
  override fallback = null;
  override fallbackTools = [];
  override agentSkills = ["text-to-speech"];

  override capabilities = ["text_to_speech", "offline_generation"];
  override supports = { voice_cloning: false, multilingual: true, offline: true, native_audio: true };
  override bestFor = ["zero-key default narration", "fully offline first-run", "fallback when no TTS provider is configured"];
  override notGoodFor = ["broadcast-grade expressive voice", "voice clone matching"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", description: "Text to speak" },
      voice: { type: "string", description: "OS voice name (optional; e.g. a SAPI voice)" },
      rate: { type: "number", default: 0, description: "Speaking rate. SAPI -10..10; say words/min; espeak wpm." },
      output_path: { type: "string" },
    },
  };
  override resourceProfile: ResourceProfile = { cpuCores: 1, ramMb: 128, vramMb: 0, diskMb: 20, networkRequired: false };
  override retryPolicy: RetryPolicy = { maxRetries: 1, backoffSeconds: 0, retryableErrors: [] };
  override idempotencyKeyFields = ["text", "voice", "rate"];
  override sideEffects = ["writes a wav file to output_path"];
  override userVisibleVerification = ["Listen to generated audio for intelligibility"];

  override getStatus(): ToolStatus {
    const p = process.platform;
    if (p === "win32") return "available"; // SAPI ships with .NET on every Windows
    if (p === "darwin") return commandExists("say") ? "available" : "unavailable";
    return commandExists("espeak-ng") || commandExists("espeak") ? "available" : "unavailable";
  }

  override estimateCost(_inputs: Record<string, unknown>): number {
    return 0.0;
  }

  /** Pure command builder — the OS-appropriate system-voice invocation. */
  buildCommand(inputs: Record<string, unknown>, platform: string = process.platform): SystemTTSCommand {
    const text = String(inputs.text ?? "");
    const voice = typeof inputs.voice === "string" ? inputs.voice : "";
    const rate = typeof inputs.rate === "number" ? inputs.rate : 0;
    const outputPath = typeof inputs.output_path === "string" ? inputs.output_path : "system_tts.wav";

    if (platform === "win32") {
      const selectVoice = voice ? `$s.SelectVoice('${psEscape(voice)}');` : "";
      const script =
        "Add-Type -AssemblyName System.Speech; " +
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
        `$s.Rate = ${Math.max(-10, Math.min(10, Math.round(rate)))}; ` +
        selectVoice +
        `$s.SetOutputToWaveFile('${psEscape(outputPath)}'); ` +
        `$s.Speak('${psEscape(text)}'); $s.Dispose();`;
      return { bin: "powershell", args: ["-NoProfile", "-Command", script], outputPath, format: "wav" };
    }
    if (platform === "darwin") {
      const args = ["-o", outputPath, "--file-format=WAVE"];
      if (voice) args.push("-v", voice);
      if (rate) args.push("-r", String(Math.round(rate)));
      args.push(text);
      return { bin: "say", args, outputPath, format: "wav" };
    }
    const bin = commandExists("espeak-ng") ? "espeak-ng" : "espeak";
    const args = ["-w", outputPath];
    if (voice) args.push("-v", voice);
    if (rate) args.push("-s", String(Math.round(rate)));
    args.push(text);
    return { bin, args, outputPath, format: "wav" };
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    if (this.getStatus() !== "available") {
      return toolResult({ success: false, error: `System TTS not available. ${this.installInstructions}` });
    }
    const start = Date.now();
    try {
      const cmd = this.buildCommand(inputs);
      mkdirSync(dirname(cmd.outputPath), { recursive: true });
      const proc = spawnSync(cmd.bin, cmd.args, { encoding: "utf8" });
      if (proc.status !== 0) return toolResult({ success: false, error: `System TTS failed (exit ${proc.status}): ${proc.stderr ?? ""}` });
      if (!existsSync(cmd.outputPath)) return toolResult({ success: false, error: `System TTS produced no file: ${cmd.outputPath}` });
      return toolResult({
        success: true,
        data: {
          provider: this.provider, voice: typeof inputs.voice === "string" ? inputs.voice : "default",
          text_length: String(inputs.text ?? "").length, output: cmd.outputPath, format: "wav",
        },
        artifacts: [cmd.outputPath],
        model: `system/${process.platform}`,
        durationSeconds: Math.round((Date.now() - start) / 10) / 100,
      });
    } catch (err) {
      return toolResult({ success: false, error: `System TTS failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
}
