// CLIP-shaped embedder contract with deterministic local vectors.

import { existsSync, readFileSync } from "node:fs";

export const CLIP_EMBED_DIM = 512;
export const CLIP_MODEL_ID = "openai/clip-vit-base-patch32";

export interface ClipModelInfo {
  model_id: string;
  device: string;
  dim: number;
}

export function modelInfo(): ClipModelInfo {
  return {
    model_id: CLIP_MODEL_ID,
    device: "cpu",
    dim: CLIP_EMBED_DIM,
  };
}

function fnv1a(input: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

export function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm < 1e-8) return new Array<number>(vector.length).fill(0);
  return vector.map((value) => value / norm);
}

function embedTokens(tokens: string[], salt: string): number[] {
  const vector = new Array<number>(CLIP_EMBED_DIM).fill(0);
  for (const token of tokens) {
    const hash = fnv1a(`${salt}:${token}`);
    const index = hash % CLIP_EMBED_DIM;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  return l2Normalize(vector);
}

export function embedTexts(texts: string[]): number[][] {
  if (texts.length === 0) return [];
  return texts.map((text) => {
    const safeText = text && text.trim() ? text : "untitled";
    const clipped = tokenize(safeText).slice(0, 77);
    return embedTokens(clipped.length ? clipped : ["untitled"], "text");
  });
}

function imageTokens(path: string): string[] {
  if (!existsSync(path)) return tokenize(path);
  const bytes = readFileSync(path, "utf8");
  const chunks: string[] = [path];
  for (let i = 0; i < bytes.length; i += 64) chunks.push(bytes.slice(i, i + 64));
  return chunks;
}

export function embedImages(imagePaths: string[]): number[][] {
  if (imagePaths.length === 0) return [];
  return imagePaths.map((path) => embedTokens(imageTokens(path), "image"));
}

export function poolFrames(frameEmbeddings: number[][]): number[] {
  if (frameEmbeddings.length === 0) return new Array<number>(CLIP_EMBED_DIM).fill(0);
  const mean = new Array<number>(CLIP_EMBED_DIM).fill(0);
  for (const frame of frameEmbeddings) {
    for (let i = 0; i < CLIP_EMBED_DIM; i++) mean[i] = (mean[i] ?? 0) + (frame[i] ?? 0);
  }
  for (let i = 0; i < CLIP_EMBED_DIM; i++) mean[i] = (mean[i] ?? 0) / frameEmbeddings.length;
  return l2Normalize(mean);
}

export const model_info = modelInfo;
export const embed_texts = embedTexts;
export const embed_images = embedImages;
export const pool_frames = poolFrames;
