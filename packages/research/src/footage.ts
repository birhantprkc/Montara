// @montara/research — CLIP-indexed footage retrieval (Intelligence §H).
// Stage 1 ships a deterministic local text-embedding so semantic retrieval works fully offline
// with zero model downloads; a real CLIP / transformers.js embedder swaps in behind this shape.

export interface FootageItem {
  id: string;
  title: string;
  tags: string[];
  source?: string;
  url?: string;
}

export interface IndexedFootage extends FootageItem {
  embedding: number[];
}

export interface FootageMatch {
  item: FootageItem;
  /** 0..1 cosine similarity */
  similarity: number;
}

const EMBED_DIM = 96;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

/** FNV-1a hash of a token into the embedding space. */
function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % EMBED_DIM;
}

/** Deterministic bag-of-words embedding, L2-normalized. Shared words -> higher cosine. */
export function embedText(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  for (const token of tokenize(text)) {
    const idx = hashToken(token);
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return Math.max(0, Math.min(1, dot));
}

export function indexFootage(items: FootageItem[]): IndexedFootage[] {
  return items.map((item) => ({
    ...item,
    embedding: embedText(`${item.title} ${item.tags.join(" ")}`),
  }));
}

export function retrieveFootage(query: string, index: IndexedFootage[], k = 3): FootageMatch[] {
  const q = embedText(query);
  return index
    .map((item) => ({ item, similarity: Math.round(cosine(q, item.embedding) * 1000) / 1000 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, k));
}
