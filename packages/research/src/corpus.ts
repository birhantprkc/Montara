// Append-only local clip corpus with vector retrieval.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIP_EMBED_DIM, l2Normalize } from "./clipEmbedder";

export const EMBED_DIM = CLIP_EMBED_DIM;

export interface ClipRecord {
  clip_id: string;
  source: string;
  source_id: string;
  source_url: string;
  local_path: string;
  kind: string;
  thumb_dir: string;
  query: string;
  creator: string;
  license: string;
  duration: number;
  width: number;
  height: number;
  motion_score: number;
  dominant_colors: number[][];
  source_tags: string;
  shot_type: string;
  time_of_day: string;
  added_at: number;
}

export type ClipRecordInput = Partial<ClipRecord> & Pick<ClipRecord, "clip_id" | "source" | "source_id" | "source_url" | "local_path">;

export interface RankOptions {
  k?: number;
  tagWeight?: number;
  motionMin?: number | null;
  kind?: string | null;
  excludeIds?: Iterable<string> | null;
}

export function createClipRecord(input: ClipRecordInput): ClipRecord {
  return {
    kind: "video",
    thumb_dir: "",
    query: "",
    creator: "",
    license: "",
    duration: 0.0,
    width: 0,
    height: 0,
    motion_score: 0.0,
    dominant_colors: [],
    source_tags: "",
    shot_type: "",
    time_of_day: "",
    added_at: 0.0,
    ...input,
  };
}

function nowSeconds(): number {
  return Date.now() / 1000;
}

function ensureVector(name: string, vector: number[]): number[] {
  if (vector.length !== EMBED_DIM) {
    throw new Error(`${name} must be (${EMBED_DIM},), got (${vector.length},)`);
  }
  return vector.map((value) => Number(value) || 0);
}

function readJsonVectorBank(path: string): number[][] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((row): row is number[] => Array.isArray(row))
    .map((row) => ensureVector("embedding", row));
}

function writeJsonVectorBank(path: string, bank: number[][]): void {
  writeFileSync(path, `${JSON.stringify(bank)}\n`);
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < EMBED_DIM; i++) total += (a[i] ?? 0) * (b[i] ?? 0);
  return total;
}

function argsortDesc(values: number[]): number[] {
  return values.map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.index);
}

export class Corpus {
  corpusDir: string;
  records: ClipRecord[] = [];
  clipEmbeddings: number[][] = [];
  tagEmbeddings: number[][] = [];
  private idToRow = new Map<string, number>();

  constructor(corpusDir: string) {
    this.corpusDir = corpusDir;
  }

  get clipsDir(): string {
    return join(this.corpusDir, "clips");
  }

  get thumbsDir(): string {
    return join(this.corpusDir, "thumbnails");
  }

  get indexPath(): string {
    return join(this.corpusDir, "index.jsonl");
  }

  get embedPath(): string {
    return join(this.corpusDir, "embeddings.npy");
  }

  get tagEmbedPath(): string {
    return join(this.corpusDir, "tag_embeddings.npy");
  }

  ensureDirs(): void {
    mkdirSync(this.corpusDir, { recursive: true });
    mkdirSync(this.clipsDir, { recursive: true });
    mkdirSync(this.thumbsDir, { recursive: true });
  }

  load(): void {
    this.records = [];
    this.idToRow = new Map();

    if (existsSync(this.indexPath)) {
      const lines = readFileSync(this.indexPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const record = createClipRecord(JSON.parse(trimmed) as ClipRecordInput);
        this.idToRow.set(record.clip_id, this.records.length);
        this.records.push(record);
      }
    }

    this.clipEmbeddings = readJsonVectorBank(this.embedPath);
    this.tagEmbeddings = readJsonVectorBank(this.tagEmbedPath);

    const n = Math.min(this.records.length, this.clipEmbeddings.length, this.tagEmbeddings.length);
    if (n !== this.records.length) {
      this.records = this.records.slice(0, n);
      this.idToRow = new Map(this.records.map((record, index) => [record.clip_id, index]));
    }
    if (this.clipEmbeddings.length !== n) this.clipEmbeddings = this.clipEmbeddings.slice(0, n);
    if (this.tagEmbeddings.length !== n) this.tagEmbeddings = this.tagEmbeddings.slice(0, n);
  }

  save(): void {
    this.ensureDirs();
    const tmpIndex = `${this.indexPath}.tmp`;
    writeFileSync(tmpIndex, this.records.map((record) => JSON.stringify(record)).join("\n") + (this.records.length ? "\n" : ""));
    writeFileSync(this.indexPath, readFileSync(tmpIndex, "utf8"));
    writeJsonVectorBank(this.embedPath, this.clipEmbeddings);
    writeJsonVectorBank(this.tagEmbedPath, this.tagEmbeddings);
  }

  has(clipId: string): boolean {
    return this.idToRow.has(clipId);
  }

  add(recordInput: ClipRecordInput | ClipRecord, clipEmbedding: number[], tagEmbedding: number[]): void {
    const record = createClipRecord(recordInput);
    if (this.idToRow.has(record.clip_id)) return;
    const clip = ensureVector("clip_embedding", clipEmbedding);
    const tag = ensureVector("tag_embedding", tagEmbedding);
    if (record.added_at === 0.0) record.added_at = nowSeconds();

    this.idToRow.set(record.clip_id, this.records.length);
    this.records.push(record);
    this.clipEmbeddings.push(clip);
    this.tagEmbeddings.push(tag);
  }

  get(clipId: string): ClipRecord | null {
    const row = this.idToRow.get(clipId);
    return row == null ? null : this.records[row] ?? null;
  }

  get length(): number {
    return this.records.length;
  }

  private fusedSims(queryVec: number[], tagWeight: number): number[] {
    if (this.clipEmbeddings.length === 0) return [];
    const query = ensureVector("query_embedding", queryVec);
    return this.clipEmbeddings.map((clip, index) => {
      const visual = dot(clip, query);
      const tag = dot(this.tagEmbeddings[index] ?? new Array<number>(EMBED_DIM).fill(0), query);
      return (1.0 - tagWeight) * visual + tagWeight * tag;
    });
  }

  rankByText(queryEmbedding: number[], opts: RankOptions = {}): [ClipRecord, number][] {
    if (this.records.length === 0) return [];
    const k = opts.k ?? 20;
    const tagWeight = opts.tagWeight ?? 0.3;
    const motionMin = opts.motionMin ?? null;
    const kind = opts.kind ?? null;
    const exclude = new Set(opts.excludeIds ?? []);
    const scores = this.fusedSims(queryEmbedding, tagWeight);

    const ranked: [number, number][] = [];
    for (let i = 0; i < scores.length; i++) {
      const record = this.records[i];
      if (!record) continue;
      if (exclude.has(record.clip_id)) continue;
      if (kind && record.kind !== kind) continue;
      if (motionMin !== null && record.motion_score < motionMin) continue;
      ranked.push([i, Number(scores[i])]);
    }

    ranked.sort((a, b) => b[1] - a[1]);
    return ranked.slice(0, k).map(([index, score]) => [this.records[index] as ClipRecord, score]);
  }

  knn(clipId: string, k = 5, excludeIds: Iterable<string> | null = null): [ClipRecord, number][] {
    const seedIdx = this.idToRow.get(clipId);
    if (seedIdx == null) return [];
    const seedVec = this.clipEmbeddings[seedIdx] as number[];
    const sims = this.clipEmbeddings.map((embedding) => dot(embedding, seedVec));
    const exclude = new Set(excludeIds ?? []);
    exclude.add(clipId);

    const ranked: [number, number][] = [];
    for (let i = 0; i < sims.length; i++) {
      const record = this.records[i];
      if (!record || exclude.has(record.clip_id)) continue;
      ranked.push([i, Number(sims[i])]);
    }
    ranked.sort((a, b) => b[1] - a[1]);
    return ranked.slice(0, k).map(([index, score]) => [this.records[index] as ClipRecord, score]);
  }

  findSimilarSet(
    seedClipId: string,
    n = 5,
    diversity = 0.3,
    candidatePool = 30,
    excludeIds: Iterable<string> | null = null,
  ): [ClipRecord, number][] {
    const seedIdx = this.idToRow.get(seedClipId);
    if (seedIdx == null) return [];
    const seedVec = this.clipEmbeddings[seedIdx] as number[];
    const exclude = new Set(excludeIds ?? []);
    exclude.add(seedClipId);

    const simsToSeed = this.clipEmbeddings.map((embedding) => dot(embedding, seedVec));
    const pool: number[] = [];
    for (const index of argsortDesc(simsToSeed)) {
      const record = this.records[index];
      if (!record || exclude.has(record.clip_id)) continue;
      pool.push(index);
      if (pool.length >= candidatePool) break;
    }
    if (!pool.length) return [];

    const picked: number[] = [];
    const pickedScores: number[] = [];
    while (pool.length && picked.length < n) {
      let bestIndex = -1;
      let bestScore = -1e9;
      for (const index of pool) {
        const simSeed = simsToSeed[index] ?? 0;
        let simPicked = 0.0;
        if (picked.length) {
          simPicked = Math.max(...picked.map((pickedIndex) => dot(this.clipEmbeddings[index] as number[], this.clipEmbeddings[pickedIndex] as number[])));
        }
        const mmr = (1.0 - diversity) * simSeed - diversity * simPicked;
        if (mmr > bestScore) {
          bestScore = mmr;
          bestIndex = index;
        }
      }
      picked.push(bestIndex);
      pickedScores.push(bestScore);
      pool.splice(pool.indexOf(bestIndex), 1);
    }

    return picked.map((index, i) => [this.records[index] as ClipRecord, pickedScores[i] ?? 0]);
  }

  diversify(candidateIds: string[], n: number, diversity = 0.5): string[] {
    if (!candidateIds.length) return [];
    const idxs = candidateIds
      .map((id) => this.idToRow.get(id))
      .filter((index): index is number => index != null);
    if (!idxs.length) return [];

    const picked: number[] = [idxs[0] as number];
    const remaining = idxs.slice(1);

    while (remaining.length && picked.length < n) {
      let bestIndex = -1;
      let bestScore = -1e9;
      for (const index of remaining) {
        const simPicked = Math.max(...picked.map((pickedIndex) => dot(this.clipEmbeddings[index] as number[], this.clipEmbeddings[pickedIndex] as number[])));
        let score = -simPicked;
        score = diversity * score + (1.0 - diversity) * (-remaining.indexOf(index));
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      picked.push(bestIndex);
      remaining.splice(remaining.indexOf(bestIndex), 1);
    }

    return picked.map((index) => (this.records[index] as ClipRecord).clip_id);
  }
}

export function listCorpusFiles(corpusDir: string): string[] {
  if (!existsSync(corpusDir)) return [];
  return readdirSync(corpusDir, { withFileTypes: true }).map((entry) => entry.name);
}

export function normalizedVector(activeIndex: number): number[] {
  const vector = new Array<number>(EMBED_DIM).fill(0);
  vector[activeIndex % EMBED_DIM] = 1;
  return l2Normalize(vector);
}
