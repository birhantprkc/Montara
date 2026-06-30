import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HttpRequestSpec, MediaCategory, MediaProvider } from "./registry";

export interface ProviderHttpResponse {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export type ProviderFetch = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<ProviderHttpResponse>;

export type ProviderDownloader = (url: string) => Promise<Uint8Array>;

export interface ExecuteProviderRequestOptions {
  fetch: ProviderFetch;
  download?: ProviderDownloader;
  outPath?: string;
  maxPolls?: number;
}

export interface ProviderExecutionResult {
  ok: boolean;
  providerId: string;
  category: MediaCategory;
  status: number;
  artifactPath?: string;
  outputUrl?: string;
  jobId?: string;
  response: unknown;
  polls: number;
  error?: string;
}

export function redactProviderRequest(spec: HttpRequestSpec): HttpRequestSpec {
  const headers = Object.fromEntries(Object.entries(spec.headers).map(([key, value]) => {
    if (/authorization|api-key|x-key|xi-api-key/i.test(key)) return [key, "[REDACTED]"];
    return [key, value];
  }));
  const url = spec.url
    .replace(/([?&](?:key|api_key|client_id)=)[^&]+/gi, "$1[REDACTED]")
    .replace(/(https:\/\/api\.bfl\.ai\/v1\/get_result\?id=)[^&]+/gi, "$1[REDACTED]");
  return { ...spec, url, headers };
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

async function readJson(resp: ProviderHttpResponse): Promise<unknown> {
  if (resp.json) return resp.json();
  if (resp.text) {
    const txt = await resp.text();
    return txt ? JSON.parse(txt) : {};
  }
  return {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function findOutputUrl(value: unknown): string | undefined {
  const obj = asRecord(value);
  const result = asRecord(obj.result);
  const image = asRecord(obj.image);
  const video = asRecord(obj.video);
  const images = Array.isArray(obj.images) ? obj.images : [];
  const output = Array.isArray(obj.output) ? obj.output : [];

  return str(result.sample)
    ?? str(result.url)
    ?? str(image.url)
    ?? str(video.url)
    ?? str(asRecord(images[0]).url)
    ?? str(output[0])
    ?? str(obj.url)
    ?? str(obj.output_url);
}

function statusOf(value: unknown): string {
  const raw = asRecord(value).status ?? asRecord(value).state;
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

async function writeArtifact(url: string, outPath: string, download: ProviderDownloader): Promise<void> {
  ensureParent(outPath);
  const bytes = await download(url);
  writeFileSync(outPath, bytes);
}

export async function executeProviderRequest(
  provider: MediaProvider,
  request: HttpRequestSpec,
  opts: ExecuteProviderRequestOptions,
): Promise<ProviderExecutionResult> {
  const maxPolls = opts.maxPolls ?? 20;
  const first = await opts.fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  const firstBody = await readJson(first);
  if (!first.ok) {
    return { ok: false, providerId: provider.id, category: provider.category, status: first.status, response: firstBody, polls: 0, error: `HTTP ${first.status}` };
  }

  let body = firstBody;
  let polls = 0;
  const firstRecord = asRecord(firstBody);
  const jobId = str(firstRecord.id) ?? str(firstRecord.task_id) ?? str(firstRecord.request_id);
  let pollUrl = str(firstRecord.polling_url) ?? str(firstRecord.status_url) ?? (request.poll?.field ? str(firstRecord[request.poll.field]) : undefined);
  const responseUrl = str(firstRecord.response_url);

  while (pollUrl && polls < maxPolls) {
    const statusResp = await opts.fetch(pollUrl, { method: "GET", headers: request.headers });
    body = await readJson(statusResp);
    polls += 1;
    if (!statusResp.ok) {
      return { ok: false, providerId: provider.id, category: provider.category, status: statusResp.status, response: body, polls, jobId, error: `HTTP ${statusResp.status}` };
    }
    const state = statusOf(body);
    if (["ready", "completed", "succeeded", "success"].includes(state)) break;
    if (["error", "failed", "cancelled", "canceled"].includes(state)) {
      return { ok: false, providerId: provider.id, category: provider.category, status: statusResp.status, response: body, polls, jobId, error: state };
    }
  }

  if (responseUrl && !findOutputUrl(body)) {
    const resultResp = await opts.fetch(responseUrl, { method: "GET", headers: request.headers });
    body = await readJson(resultResp);
    if (!resultResp.ok) {
      return { ok: false, providerId: provider.id, category: provider.category, status: resultResp.status, response: body, polls, jobId, error: `HTTP ${resultResp.status}` };
    }
  }

  const outputUrl = findOutputUrl(body) ?? findOutputUrl(firstBody);
  let artifactPath: string | undefined;
  if (outputUrl && opts.outPath && opts.download) {
    await writeArtifact(outputUrl, opts.outPath, opts.download);
    artifactPath = existsSync(opts.outPath) ? opts.outPath : undefined;
  }

  return { ok: true, providerId: provider.id, category: provider.category, status: first.status, artifactPath, outputUrl, jobId, response: body, polls };
}
