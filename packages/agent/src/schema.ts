// @montara/agent — JSON Schemas for the public IR + a tiny dependency-free validator (§K).
// Draft-07 subset (type / required / properties / items / enum / minimum / minItems). Enough to
// gate scene plans, Timeline IR and pipeline manifests in contract tests without pulling ajv.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  minimum?: number;
  minItems?: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function jsType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function typeMatches(v: unknown, t: NonNullable<JsonSchema["type"]>): boolean {
  switch (t) {
    case "object": return isObject(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "boolean": return typeof v === "boolean";
  }
}

/** Returns a list of human-readable validation errors ([] = valid). */
export function validateJson(value: unknown, schema: JsonSchema, path = "$"): string[] {
  const errors: string[] = [];

  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${jsType(value)}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) {
    errors.push(`${path}: ${JSON.stringify(value)} not one of ${JSON.stringify(schema.enum)}`);
  }
  if (typeof value === "number" && schema.minimum != null && value < schema.minimum) {
    errors.push(`${path}: ${value} below minimum ${schema.minimum}`);
  }
  if (schema.type === "object" && isObject(value)) {
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push(`${path}.${req}: required property missing`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validateJson(value[key], sub, `${path}.${key}`));
    }
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      errors.push(`${path}: ${value.length} items below minItems ${schema.minItems}`);
    }
    if (schema.items) value.forEach((item, i) => errors.push(...validateJson(item, schema.items as JsonSchema, `${path}[${i}]`)));
  }
  return errors;
}

const sceneSchema: JsonSchema = {
  type: "object",
  required: ["id", "title", "durationSec"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    durationSec: { type: "number", minimum: 0 },
    background: { type: "string" },
  },
};

export const scenePlanSchema: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "montara:scene-plan",
  title: "Montara ScenePlan",
  type: "object",
  required: ["width", "height", "fps", "scenes"],
  properties: {
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    fps: { type: "integer", minimum: 1 },
    scenes: { type: "array", minItems: 1, items: sceneSchema },
  },
};

const clipSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "startSec", "durationSec"],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["video", "audio", "text"] },
    startSec: { type: "number", minimum: 0 },
    durationSec: { type: "number", minimum: 0 },
  },
};

const trackSchema: JsonSchema = {
  type: "object",
  required: ["id", "type", "clips"],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: ["video", "audio", "text"] },
    clips: { type: "array", items: clipSchema },
  },
};

const compositionSchema: JsonSchema = {
  type: "object",
  required: ["width", "height", "fps", "durationSec", "background"],
  properties: {
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    fps: { type: "integer", minimum: 1 },
    durationSec: { type: "number", minimum: 0 },
    background: { type: "string" },
  },
};

export const timelineSchema: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "montara:timeline",
  title: "Montara Timeline IR",
  type: "object",
  required: ["version", "composition", "tracks"],
  properties: {
    version: { type: "string", enum: ["1.1"] },
    composition: compositionSchema,
    tracks: { type: "array", minItems: 1, items: trackSchema },
  },
};

export const pipelineSchema: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "montara:pipeline",
  title: "Montara Pipeline Manifest",
  type: "object",
  required: ["id", "name", "blurb", "palette", "beats"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    blurb: { type: "string" },
    palette: { type: "array", minItems: 1, items: { type: "string" } },
    beats: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["label", "weight"],
        properties: { label: { type: "string" }, weight: { type: "number", minimum: 0 } },
      },
    },
  },
};

export const SCHEMAS: Record<string, JsonSchema> = {
  "scene-plan": scenePlanSchema,
  "timeline": timelineSchema,
  "pipeline": pipelineSchema,
};

export function writeSchemas(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const path = join(dir, `${name}.schema.json`);
    writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`);
    written.push(path);
  }
  return written;
}
