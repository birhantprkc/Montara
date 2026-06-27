// Minimal YAML reader/writer for the manifest and playbook shapes used here.

import { existsSync, readFileSync } from "node:fs";

export type YamlValue = string | number | boolean | null | YamlObject | YamlValue[];
export interface YamlObject {
  [key: string]: YamlValue;
}

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

export function parseScalar(raw: string): YamlValue {
  const value = raw.trim();
  if (!value) return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part.trim()));
  }
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : value;
}

function setNested(root: YamlObject, path: string[], key: string, value: YamlValue): void {
  let node: YamlObject = root;
  for (const part of path) {
    const current = node[part];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      node[part] = {};
    }
    node = node[part] as YamlObject;
  }
  node[key] = value;
}

function getNested(root: YamlObject, path: string[]): YamlObject {
  let node = root;
  for (const part of path) node = node[part] as YamlObject;
  return node;
}

export function parseSimpleYaml(text: string): YamlObject {
  const root: YamlObject = {};
  const objectPathByIndent = new Map<number, string[]>();
  objectPathByIndent.set(0, []);
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = stripInlineComment(lines[i] ?? "");
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = raw.trim();
    const parentIndent = Math.max(...[...objectPathByIndent.keys()].filter((n) => n <= indent));
    const parentPath = objectPathByIndent.get(parentIndent) ?? [];
    const parent = getNested(root, parentPath);

    if (trimmed.startsWith("- ")) {
      const body = trimmed.slice(2).trim();
      const lastKey = parentPath[parentPath.length - 1];
      const grandPath = parentPath.slice(0, -1);
      const grand = getNested(root, grandPath);
      if (!lastKey) continue;
      if (!Array.isArray(grand[lastKey])) grand[lastKey] = [];
      const arr = grand[lastKey] as YamlValue[];
      const colon = body.indexOf(":");
      if (colon > 0) {
        const obj: YamlObject = {};
        obj[body.slice(0, colon).trim()] = parseScalar(body.slice(colon + 1));
        arr.push(obj);
        objectPathByIndent.set(indent + 2, [...grandPath, lastKey, String(arr.length - 1)]);
      } else {
        arr.push(parseScalar(body));
      }
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    const path = objectPathByIndent.get(parentIndent) ?? [];
    if (!value) {
      setNested(root, path, key, {});
      objectPathByIndent.set(indent + 2, [...path, key]);
    } else {
      setNested(root, path, key, parseScalar(value));
    }
  }

  return root;
}

export function loadYamlFile(path: string): YamlObject {
  if (!existsSync(path)) throw new Error(`YAML file not found: ${path}`);
  return parseSimpleYaml(readFileSync(path, "utf8"));
}

function scalar(value: YamlValue): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  return /^[A-Za-z0-9 _./:#()-]+$/.test(text) ? text : JSON.stringify(text);
}

export function dumpSimpleYaml(value: YamlValue, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as YamlObject);
        const [firstKey, firstValue] = entries[0] ?? ["", ""];
        const head = `${pad}- ${firstKey}: ${firstValue && typeof firstValue === "object" ? "" : scalar(firstValue)}`;
        const tail = entries.slice(1).map(([key, child]) => (
          child && typeof child === "object"
            ? `${pad}  ${key}:\n${dumpSimpleYaml(child, indent + 4)}`
            : `${pad}  ${key}: ${scalar(child)}`
        ));
        return [head, ...tail].join("\n");
      }
      return `${pad}- ${scalar(item)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as YamlObject).map(([key, child]) => (
      child && typeof child === "object"
        ? `${pad}${key}:\n${dumpSimpleYaml(child, indent + 2)}`
        : `${pad}${key}: ${scalar(child)}`
    )).join("\n");
  }
  return `${pad}${scalar(value)}`;
}
