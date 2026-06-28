// @montara/llm — Montara's local-LLM brain. A first-class, zero-key reasoning backend that talks to
// whatever local server is running: Ollama, LM Studio, or a llama.cpp server. Detection is by HTTP
// ping (short timeout) so it never blocks; generation uses the native Ollama API or the
// OpenAI-compatible API (LM Studio / llama.cpp). The orchestrator and assistants use this when no
// cloud key is set — so Montara can plan, write, and self-review fully offline.

import { spawnSync } from "node:child_process";

export type BackendKind = "ollama" | "openai-compatible";

export interface BrainBackend {
  id: string;
  baseUrl: string;
  kind: BackendKind;
}

export const BRAIN_BACKENDS: BrainBackend[] = [
  { id: "ollama", baseUrl: "http://127.0.0.1:11434", kind: "ollama" },
  { id: "lmstudio", baseUrl: "http://127.0.0.1:1234", kind: "openai-compatible" },
  { id: "llamacpp", baseUrl: "http://127.0.0.1:8080", kind: "openai-compatible" },
];

/** The static catalogue of supported local backends (sync; for listing / docs / doctor). */
export function brainCatalogue(): BrainBackend[] {
  return [...BRAIN_BACKENDS];
}

/** Cheap sync check that the Ollama CLI is installed (the server may still be off). */
export function ollamaInstalled(): boolean {
  return (spawnSync("ollama", ["--version"], { encoding: "utf8" }).status ?? -1) === 0;
}

/** Installed Ollama models via the CLI (sync — for the synchronous CLI surface). */
export function ollamaModelsSync(): string[] {
  const r = spawnSync("ollama", ["list"], { encoding: "utf8" });
  if ((r.status ?? -1) !== 0) return [];
  return (r.stdout || "")
    .split(/\r?\n/)
    .slice(1) // drop the header row
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

/** Complete a prompt via the Ollama CLI (sync). Returns null if Ollama/model is unavailable. */
export function ollamaCompleteSync(prompt: string, model?: string): { text: string; model: string } | null {
  const m = model ?? ollamaModelsSync()[0];
  if (!m) return null;
  const r = spawnSync("ollama", ["run", m, prompt], { encoding: "utf8", timeout: 180000, maxBuffer: 1 << 24 });
  if ((r.status ?? -1) !== 0) return null;
  return { text: (r.stdout || "").trim(), model: m };
}

async function ping(url: string, ms = 600): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.ok || r.status === 404; // a 404 still means a server answered
  } catch {
    return false;
  }
}

/** First local backend whose server actually answers, or null if none is running. */
export async function detectBackend(): Promise<BrainBackend | null> {
  for (const b of BRAIN_BACKENDS) {
    const probe = b.kind === "ollama" ? `${b.baseUrl}/api/tags` : `${b.baseUrl}/v1/models`;
    if (await ping(probe)) return b;
  }
  return null;
}

/** Whether any local LLM brain is reachable right now. */
export async function brainAvailable(): Promise<boolean> {
  return (await detectBackend()) !== null;
}

/** Installed model names for a backend (Ollama /api/tags or OpenAI /v1/models). */
export async function listModels(backend: BrainBackend): Promise<string[]> {
  try {
    if (backend.kind === "ollama") {
      const r = await fetch(`${backend.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      const j = (await r.json()) as { models?: { name: string }[] };
      return (j.models ?? []).map((m) => m.name);
    }
    const r = await fetch(`${backend.baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) });
    const j = (await r.json()) as { data?: { id: string }[] };
    return (j.data ?? []).map((m) => m.id);
  } catch {
    return [];
  }
}

export interface BrainResult {
  text: string;
  model: string;
  backend: string;
}

export interface CompleteOptions {
  model?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** Complete a prompt on the first available local backend. Returns null if no brain is reachable. */
export async function brainComplete(prompt: string, opts: CompleteOptions = {}): Promise<BrainResult | null> {
  const backend = await detectBackend();
  if (!backend) return null;
  const models = await listModels(backend);
  const model = opts.model ?? models[0];
  if (!model) return null;
  const timeout = opts.timeoutMs ?? 120000;

  try {
    if (backend.kind === "ollama") {
      const r = await fetch(`${backend.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, system: opts.system, stream: false, options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 512 } }),
        signal: AbortSignal.timeout(timeout),
      });
      const j = (await r.json()) as { response?: string };
      return { text: (j.response ?? "").trim(), model, backend: backend.id };
    }
    const messages = opts.system ? [{ role: "system", content: opts.system }, { role: "user", content: prompt }] : [{ role: "user", content: prompt }];
    const r = await fetch(`${backend.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.maxTokens ?? 512, stream: false }),
      signal: AbortSignal.timeout(timeout),
    });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: (j.choices?.[0]?.message?.content ?? "").trim(), model, backend: backend.id };
  } catch {
    return null;
  }
}
