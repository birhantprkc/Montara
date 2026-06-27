// @montara/tools — tool registry.
// Discovers registered tools and reports availability/capabilities to the orchestrator.

import type { BaseTool, ToolStatus, ToolTier } from "./base";

export class ToolRegistry {
  private tools = new Map<string, BaseTool>();

  register(tool: BaseTool): void {
    if (!tool.name) throw new Error("Tool must have a non-empty name");
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: BaseTool[]): string[] {
    for (const t of tools) this.register(t);
    return tools.map((t) => t.name);
  }

  clear(): void {
    this.tools.clear();
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  all(): BaseTool[] {
    return [...this.tools.values()];
  }

  byTier(tier: ToolTier): BaseTool[] {
    return this.all().filter((t) => t.tier === tier);
  }

  byCapability(capability: string): BaseTool[] {
    return this.all().filter((t) => t.capability === capability);
  }

  available(secrets: Record<string, string | undefined> = process.env): BaseTool[] {
    return this.all().filter((t) => t.getStatus(secrets) === "available");
  }

  statuses(secrets: Record<string, string | undefined> = process.env): { name: string; status: ToolStatus }[] {
    return this.all().map((t) => ({ name: t.name, status: t.getStatus(secrets) }));
  }
}
