// @montara/tools — tool connectors on the BaseTool contract.
export * from "./base";
export * from "./registry";
export * from "./audio/elevenlabs-tts";

import { ToolRegistry } from "./registry";
import { ElevenLabsTTS } from "./audio/elevenlabs-tts";

/** Build a registry populated with every ported tool. Grows one tool at a time. */
export function buildDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([new ElevenLabsTTS()]);
  return registry;
}
