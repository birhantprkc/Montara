// @montara/tools — tool connectors on the BaseTool contract.
export * from "./base";
export * from "./registry";
export * from "./audio/elevenlabs-tts";
export * from "./audio/openai-tts";
export * from "./audio/google-tts";
export * from "./audio/piper-tts";
export * from "./audio/doubao-tts";
export * from "./audio/tts-selector";

import { ToolRegistry } from "./registry";
import { ElevenLabsTTS } from "./audio/elevenlabs-tts";
import { OpenAITTS } from "./audio/openai-tts";
import { GoogleTTS } from "./audio/google-tts";
import { PiperTTS } from "./audio/piper-tts";
import { DoubaoTTS } from "./audio/doubao-tts";
import { TTSSelector } from "./audio/tts-selector";

/** Build a registry populated with every ported tool. Grows one tool at a time. */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([
    new ElevenLabsTTS(),
    new OpenAITTS(),
    new GoogleTTS(),
    new PiperTTS(),
    new DoubaoTTS(),
    new TTSSelector(),
  ]);
  return registry;
}
