// Custom playbook generator.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Playbook = Record<string, any>;

export const STYLES_DIR = join(process.cwd(), "styles");
export const CUSTOM_STYLES_DIR = join(STYLES_DIR, "custom");

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "\"" && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw: string): any {
  const value = raw.trim();
  if (!value) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(",").map((part) => parseScalar(part.trim())) : [];
  }
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : value;
}

function parseSimpleYaml(text: string): Playbook {
  const root: Playbook = {};
  const stack: { indent: number; value: any; key?: string }[] = [{ indent: -1, value: root }];
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripInlineComment(rawLine);
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.value;
    if (trimmed.startsWith("- ")) {
      const key = stack[stack.length - 1]!.key;
      const holder = stack.length > 1 ? stack[stack.length - 2]!.value : root;
      if (key && !Array.isArray(holder[key])) holder[key] = [];
      const arr = key ? holder[key] : parent;
      if (!Array.isArray(arr)) continue;
      const body = trimmed.slice(2).trim();
      const colon = body.indexOf(":");
      if (colon > 0) {
        const obj: Playbook = {};
        obj[body.slice(0, colon).trim()] = parseScalar(body.slice(colon + 1));
        arr.push(obj);
        stack.push({ indent, value: obj });
      } else {
        arr.push(parseScalar(body));
      }
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!value) {
      parent[key] = {};
      stack.push({ indent, value: parent[key], key });
    } else {
      parent[key] = parseScalar(value);
    }
  }
  return root;
}

function dumpScalar(value: any): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  return /^[A-Za-z0-9 _./:#(),'-]+$/.test(text) ? text : JSON.stringify(text);
}

function dumpYaml(value: any, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item);
        const [firstKey, firstValue] = entries[0] ?? ["", ""];
        const lines = [`${pad}- ${firstKey}: ${firstValue && typeof firstValue === "object" ? "" : dumpScalar(firstValue)}`];
        for (const [key, child] of entries.slice(1)) {
          lines.push(child && typeof child === "object"
            ? `${pad}  ${key}:\n${dumpYaml(child, indent + 4)}`
            : `${pad}  ${key}: ${dumpScalar(child)}`);
        }
        return lines.join("\n");
      }
      return `${pad}- ${dumpScalar(item)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, child]) => (
      child && typeof child === "object"
        ? `${pad}${key}:\n${dumpYaml(child, indent + 2)}`
        : `${pad}${key}: ${dumpScalar(child)}`
    )).join("\n");
  }
  return `${pad}${dumpScalar(value)}`;
}

export function loadExistingPlaybook(name: string): Playbook {
  let path = join(STYLES_DIR, `${name}.yaml`);
  if (!existsSync(path)) path = join(CUSTOM_STYLES_DIR, `${name}.yaml`);
  if (!existsSync(path)) throw new Error(`Playbook not found: ${name}`);
  return parseSimpleYaml(readFileSync(path, "utf8"));
}

export function listPlaybooks(): string[] {
  const names = new Set<string>();
  if (existsSync(STYLES_DIR)) {
    for (const entry of readdirSync(STYLES_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".yaml")) names.add(entry.name.replace(/\.yaml$/, ""));
    }
  }
  if (existsSync(CUSTOM_STYLES_DIR)) {
    for (const entry of readdirSync(CUSTOM_STYLES_DIR, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".yaml")) names.add(entry.name.replace(/\.yaml$/, ""));
    }
  }
  return [...names].sort();
}

export function generatePlaybook(
  name: string,
  context: Record<string, any>,
  basePlaybook: string | null = null,
): Playbook {
  const playbook = basePlaybook ? loadExistingPlaybook(basePlaybook) : createMinimalPlaybook(name, context);

  playbook.identity.name = name;
  if (context.mood) playbook.identity.mood = context.mood;
  if (context.pace) playbook.identity.pace = context.pace;
  if (context.tone) {
    const toneToCategory: Record<string, string> = {
      cinematic: "cinematic",
      educational: "minimalist",
      corporate: "motion-graphics",
      playful: "motion-graphics",
      raw: "cinematic",
    };
    playbook.identity.category = toneToCategory[context.tone] ?? "custom";
  }

  if (context.colors) {
    const colors = context.colors;
    const cp = playbook.visual_language.color_palette;
    if (colors.primary) cp.primary = typeof colors.primary === "string" ? [colors.primary] : colors.primary;
    if (colors.accent) cp.accent = typeof colors.accent === "string" ? [colors.accent] : colors.accent;
    if (colors.background) cp.background = colors.background;
    if (colors.text) cp.text = colors.text;
  }

  if (context.fonts) {
    const fonts = context.fonts;
    if (fonts.headings) playbook.typography.headings.font = fonts.headings;
    if (fonts.body) playbook.typography.body.font = fonts.body;
  }

  return playbook;
}

export function createMinimalPlaybook(name: string, context: Record<string, any>): Playbook {
  const mood = context.mood ?? "professional";
  const tone = context.tone ?? "corporate";

  let bg: string;
  let text: string;
  let primary: string[];
  let accent: string[];
  if (["dark", "cinematic", "dramatic"].includes(mood)) {
    bg = "#0F172A";
    text = "#F8FAFC";
    primary = ["#3B82F6"];
    accent = ["#F59E0B"];
  } else if (["warm", "intimate", "organic"].includes(mood)) {
    bg = "#FFFBEB";
    text = "#1C1917";
    primary = ["#D97706"];
    accent = ["#059669"];
  } else if (["playful", "energetic", "bold"].includes(mood)) {
    bg = "#FFFFFF";
    text = "#1F2937";
    primary = ["#7C3AED"];
    accent = ["#EC4899"];
  } else {
    bg = "#FFFFFF";
    text = "#1F2937";
    primary = ["#2563EB"];
    accent = ["#F59E0B"];
  }

  return {
    identity: {
      name,
      category: "custom",
      mood,
      pace: context.pace ?? "moderate",
      best_for: `Custom playbook for ${tone} ${mood} content`,
    },
    visual_language: {
      color_palette: {
        primary,
        accent,
        background: bg,
        text,
      },
      composition: "balanced grid with breathing room",
      texture: "clean digital",
    },
    typography: {
      headings: { font: "Inter", weight: 700 },
      body: { font: "Inter", weight: 400 },
    },
    motion: {
      transitions: ["crossfade", "cut"],
      animation_style: "spring-based with moderate damping",
      pacing_rules: {
        min_scene_hold_seconds: 2.0,
        max_scene_hold_seconds: 6.0,
        text_card_hold_seconds: 3.5,
        stat_card_hold_seconds: 4.0,
        transition_duration_seconds: 0.4,
      },
    },
    audio: {
      voice_style: "clear, conversational, authoritative",
      music_mood: mood,
      music_volume: 0.15,
    },
    asset_generation: {
      image_prompt_prefix: `${mood} ${tone} style`,
      consistency_anchors: [`${mood} color palette`, `${tone} visual language`],
    },
    quality_rules: [
      "Maintain color consistency across all scenes",
      "Text must be legible on all backgrounds",
      "Transitions should be purposeful, not decorative",
    ],
    chart_palette: [...primary, ...accent, "#10B981", "#EF4444", "#8B5CF6"],
  };
}

export function savePlaybook(playbook: Playbook, projectName: string | null = null): string {
  const name = projectName ?? playbook.identity.name;
  const filename = String(name).toLowerCase().replace(/ /g, "-").replace(/_/g, "-");
  mkdirSync(CUSTOM_STYLES_DIR, { recursive: true });
  const path = join(CUSTOM_STYLES_DIR, `${filename}.yaml`);
  writeFileSync(path, `${dumpYaml(playbook)}\n`);
  return path;
}
