// @montara/tools/audio — capability-level TTS selector that chooses among provider tools.
// Discovery is automatic — any BaseTool with capability="tts" is a candidate. Ranking and
// normalization come from the shared scoring engine (the lib intelligence layer).

import { normalizeTaskContext, rankProviders, type ProviderScore } from "../../../quality/src/index";
import { BaseTool, toolResult, type ToolResult, type ToolStatus } from "../base";
import { ElevenLabsTTS } from "./elevenlabs-tts";
import { OpenAITTS } from "./openai-tts";
import { GoogleTTS } from "./google-tts";
import { DoubaoTTS } from "./doubao-tts";
import { PiperTTS } from "./piper-tts";

export class TTSSelector extends BaseTool {
  override name = "tts_selector";
  override version = "0.2.0";
  override tier = "voice" as const;
  override capability = "tts";
  override provider = "selector";
  override stability = "beta" as const;
  override runtime = "hybrid" as const;
  override agentSkills = ["text-to-speech", "elevenlabs", "openai-docs"];

  override capabilities = ["text_to_speech", "provider_selection"];
  override supports = { user_preference_routing: true, offline_fallback: true, multilingual: true };
  override bestFor = ["preflight tool selection", "user-facing recommendation flows"];
  override inputSchema = {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      voice_id: { type: "string", description: "Provider-specific voice ID. Passed through to the selected TTS provider." },
      model_id: { type: "string", description: "TTS model to use. Passed through to provider." },
      stability: { type: "number", minimum: 0, maximum: 1, description: "Voice stability (ElevenLabs). Lower = more expressive." },
      similarity_boost: { type: "number", minimum: 0, maximum: 1, description: "Voice similarity boost (ElevenLabs)." },
      style: { type: "number", minimum: 0, maximum: 1, description: "Style exaggeration (ElevenLabs). Higher = more expressive." },
      output_format: { type: "string", description: "Audio output format. Passed through to provider." },
      preferred_provider: { type: "string", default: "auto", description: "Provider name or 'auto'." },
      allowed_providers: { type: "array", items: { type: "string" } },
      operation: { type: "string", enum: ["generate", "rank"], default: "generate", description: "'rank' returns scored provider rankings without generating." },
      output_path: { type: "string" },
    },
  };

  private readonly tools: BaseTool[];

  constructor(tools?: BaseTool[]) {
    super();
    this.tools = tools ?? [new ElevenLabsTTS(), new OpenAITTS(), new GoogleTTS(), new DoubaoTTS(), new PiperTTS()];
    this.fallbackTools = this.providers().map((t) => t.name);
    this.providerMatrix = this.buildProviderMatrix();
  }

  /** Auto-discovered TTS providers (everything but the selector itself). */
  private providers(): BaseTool[] {
    return this.tools.filter((t) => t.name !== this.name);
  }

  private buildProviderMatrix(): Record<string, { tool: string; strength: string }> {
    const matrix: Record<string, { tool: string; strength: string }> = {};
    for (const tool of this.providers()) {
      const strength = tool.bestFor.length ? tool.bestFor.join(", ") : tool.name;
      matrix[tool.provider] = { tool: tool.name, strength };
    }
    return matrix;
  }

  override getStatus(secrets: Record<string, string | undefined> = process.env): ToolStatus {
    return this.providers().some((t) => t.getStatus(secrets) === "available") ? "available" : "unavailable";
  }

  override estimateCost(inputs: Record<string, unknown>): number {
    const candidates = this.providers();
    if (!candidates.length) return 0.0;
    const { tool } = this.selectBestTool(inputs, candidates, this.prepareTaskContext(inputs));
    return tool ? tool.estimateCost(inputs) : 0.0;
  }

  override async execute(inputs: Record<string, unknown>): Promise<ToolResult> {
    const taskContext = this.prepareTaskContext(inputs);
    const candidates = this.providers();

    if (inputs.operation === "rank") {
      const rankings = rankProviders(candidates, taskContext);
      return toolResult({
        success: true,
        data: {
          rankings: this.serializeRankings(candidates, rankings),
          explanation: rankings.slice(0, 5).map((r) => r.explain()).join("\n"),
          normalized_task_context: taskContext,
        },
      });
    }

    const { tool, score } = this.selectBestTool(inputs, candidates, taskContext);
    if (!tool) return toolResult({ success: false, error: "No TTS provider available." });

    const result = await tool.execute(inputs);
    if (result.success) {
      const data = (result.data ?? {}) as Record<string, unknown>;
      if (data.selected_tool === undefined) data.selected_tool = tool.name;
      data.selected_provider = tool.provider;
      data.selection_reason = score ? score.explain() : `Selected ${tool.provider} (${tool.name})`;
      if (score) data.provider_score = score.toDict();
      Object.assign(data, this.toolContextPayload(tool));
      data.alternatives_considered = candidates
        .filter((t) => t.name !== tool.name && t.getStatus() === "available")
        .map((t) => t.name);
      result.data = data;
    }
    return result;
  }

  private selectBestTool(
    inputs: Record<string, unknown>,
    candidates: BaseTool[],
    taskContext: Record<string, unknown>,
  ): { tool: BaseTool | null; score: ProviderScore | null } {
    const preferred = typeof inputs.preferred_provider === "string" ? inputs.preferred_provider : "auto";
    const allowed = new Set(Array.isArray(inputs.allowed_providers) ? inputs.allowed_providers.map((p) => String(p)) : []);
    let pool = candidates;
    if (allowed.size) pool = pool.filter((t) => allowed.has(t.provider));

    const rankings = rankProviders(pool, taskContext);

    const toolByProvider = new Map<string, BaseTool>();
    for (const tool of pool) {
      if (!toolByProvider.has(tool.provider) && tool.getStatus() === "available") {
        toolByProvider.set(tool.provider, tool);
      }
    }

    if (preferred !== "auto") {
      for (const item of rankings) {
        if (item.provider === preferred && toolByProvider.has(item.provider)) {
          return { tool: toolByProvider.get(item.provider)!, score: item };
        }
      }
    }
    for (const item of rankings) {
      if (toolByProvider.has(item.provider)) {
        return { tool: toolByProvider.get(item.provider)!, score: item };
      }
    }
    return { tool: null, score: null };
  }

  private prepareTaskContext(inputs: Record<string, unknown>): Record<string, unknown> {
    const taskContext = (inputs.task_context && typeof inputs.task_context === "object" && !Array.isArray(inputs.task_context))
      ? (inputs.task_context as Record<string, unknown>)
      : {};
    return normalizeTaskContext(taskContext, {
      prompt: typeof inputs.text === "string" ? inputs.text : "",
      capability: this.capability,
      operation: typeof inputs.operation === "string" ? inputs.operation : "generate",
    });
  }

  private toolContextPayload(tool: BaseTool): Record<string, unknown> {
    const info = tool.getInfo();
    return {
      selected_tool_agent_skills: info.agent_skills,
      required_agent_skills: info.agent_skills,
      selected_tool_usage_location: info.usage_location,
      selected_tool_best_for: info.best_for,
    };
  }

  private serializeRankings(candidates: BaseTool[], rankings: ProviderScore[]): Record<string, unknown>[] {
    const toolByName = new Map(candidates.map((t) => [t.name, t]));
    return rankings.map((score) => {
      const item: Record<string, unknown> = score.toDict();
      const tool = toolByName.get(score.tool_name);
      if (tool) {
        const info = tool.getInfo();
        item.agent_skills = info.agent_skills;
        item.usage_location = info.usage_location;
        item.best_for = info.best_for;
        item.status = tool.getStatus();
      }
      return item;
    });
  }
}
