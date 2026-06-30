import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildImageRequest,
  buildMusicRequest,
  buildTtsRequest,
  buildVideoRequest,
  getImageProvider,
  getMusicProvider,
  getTtsProvider,
  getVideoProvider,
  IMAGE_PROVIDERS,
  MUSIC_PROVIDERS,
  TTS_PROVIDERS,
  VIDEO_PROVIDERS,
  type HttpRequestSpec,
  type ImageGenInput,
  type MediaCategory,
  type MediaProvider,
  type MusicGenInput,
  type SpeechGenInput,
  type VideoGenInput,
} from "./registry";
import { executeProviderRequest, redactProviderRequest, type ProviderExecutionResult, type ProviderFetch } from "./executor";

export type ProviderSmokeMode = "dry-run" | "live" | "blocked";

export interface ProviderAuditFixture {
  providerId: string;
  name: string;
  category: MediaCategory;
  tier: MediaProvider["tier"];
  authEnv?: string;
  request: HttpRequestSpec;
  redactedRequest: HttpRequestSpec;
  checks: string[];
  issues: string[];
}

export interface ProviderAuditReport {
  generatedAt: string;
  total: number;
  invalid: number;
  fixtures: ProviderAuditFixture[];
}

export interface ProviderSmokeResult {
  ok: boolean;
  mode: ProviderSmokeMode;
  providerId: string;
  category: MediaCategory;
  authEnv?: string;
  credentialPresent: boolean;
  request: HttpRequestSpec;
  redactedRequest: HttpRequestSpec;
  execution?: ProviderExecutionResult;
  error?: string;
  nextStep?: string;
}

export interface ProviderSmokeOptions {
  providerId: string;
  category?: MediaCategory;
  live?: boolean;
  outPath?: string;
  env?: Record<string, string | undefined>;
  fetch?: ProviderFetch;
  download?: (url: string) => Promise<Uint8Array>;
}

const SAMPLE_PROMPT = "Montara provider smoke: cinematic product frame, no brand marks";
const REDACTION_MARKER = "fixture-redaction-marker";

const sampleVideo: VideoGenInput = {
  prompt: SAMPLE_PROMPT,
  outPath: "out/provider-smoke.mp4",
  durationSec: 4,
  width: 1280,
  height: 720,
};

const sampleImage: ImageGenInput = {
  prompt: SAMPLE_PROMPT,
  outPath: "out/provider-smoke.png",
  width: 1024,
  height: 1024,
};

const sampleSpeech: SpeechGenInput = {
  text: "Montara provider smoke. This should be short, safe, and easy to discard.",
  outPath: "out/provider-smoke.wav",
  voice: "21m00Tcm4TlvDq8ikWAM",
};

const sampleMusic: MusicGenInput = {
  prompt: "short neutral documentary underscore, no vocals",
  outPath: "out/provider-smoke.wav",
  durationSec: 8,
};

function fakeSecrets(provider: MediaProvider): Record<string, string | undefined> {
  return provider.authEnv ? { [provider.authEnv]: REDACTION_MARKER } : {};
}

function parseBody(request: HttpRequestSpec): unknown {
  if (!request.body) return undefined;
  try {
    return JSON.parse(request.body);
  } catch {
    return undefined;
  }
}

function secretLeaks(fixture: ProviderAuditFixture): boolean {
  return JSON.stringify(fixture.redactedRequest).includes(REDACTION_MARKER);
}

function validateFixture(fixture: Omit<ProviderAuditFixture, "checks" | "issues">): { checks: string[]; issues: string[] } {
  const checks: string[] = [];
  const issues: string[] = [];

  if (!fixture.request.url.startsWith("http")) issues.push("request URL must be HTTP(S) for cloud fixture");
  else checks.push("http-url");

  if (!["GET", "POST"].includes(fixture.request.method)) issues.push("request method must be GET or POST");
  else checks.push("method");

  if (fixture.request.method === "POST" && fixture.request.body && parseBody(fixture.request) == null) {
    issues.push("POST request body must be JSON parseable");
  } else if (fixture.request.body) {
    checks.push("json-body");
  }

  if (fixture.authEnv) {
    const redacted = JSON.stringify(fixture.redactedRequest);
    if (redacted.includes(REDACTION_MARKER)) issues.push("redacted request leaked fixture marker");
    else checks.push("secret-redaction");
  }

  return { checks, issues };
}

function fixtureFor(provider: MediaProvider): ProviderAuditFixture {
  const secrets = fakeSecrets(provider);
  const request =
    provider.category === "video" ? buildVideoRequest(provider, sampleVideo, secrets)
    : provider.category === "image" ? buildImageRequest(provider, sampleImage, secrets)
    : provider.category === "tts" ? buildTtsRequest(provider, sampleSpeech, secrets)
    : buildMusicRequest(provider, sampleMusic, secrets);
  const base = {
    providerId: provider.id,
    name: provider.name,
    category: provider.category,
    tier: provider.tier,
    authEnv: provider.authEnv,
    request,
    redactedRequest: redactProviderRequest(request),
  };
  const result = validateFixture(base);
  const fixture = { ...base, ...result };
  if (secretLeaks(fixture)) fixture.issues.push("secret redaction failed");
  return fixture;
}

export function cloudProviders(): MediaProvider[] {
  return [
    ...VIDEO_PROVIDERS,
    ...IMAGE_PROVIDERS,
    ...TTS_PROVIDERS,
    ...MUSIC_PROVIDERS,
  ].filter((provider) => provider.tier === "cloud");
}

export function buildProviderAuditFixtures(): ProviderAuditFixture[] {
  return cloudProviders().map(fixtureFor);
}

export function buildProviderAuditReport(): ProviderAuditReport {
  const fixtures = buildProviderAuditFixtures();
  return {
    generatedAt: new Date().toISOString(),
    total: fixtures.length,
    invalid: fixtures.filter((fixture) => fixture.issues.length > 0).length,
    fixtures,
  };
}

export function sanitizeProviderAuditReport(report: ProviderAuditReport): ProviderAuditReport {
  return {
    ...report,
    fixtures: report.fixtures.map((fixture) => ({
      ...fixture,
      request: fixture.redactedRequest,
      redactedRequest: fixture.redactedRequest,
    })),
  };
}

export function writeProviderAuditReport(outPath: string): ProviderAuditReport {
  const report = sanitizeProviderAuditReport(buildProviderAuditReport());
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function providerById(id: string, category?: MediaCategory): MediaProvider | undefined {
  if (!category || category === "video") {
    const p = getVideoProvider(id);
    if (p) return p;
  }
  if (!category || category === "image") {
    const p = getImageProvider(id);
    if (p) return p;
  }
  if (!category || category === "tts") {
    const p = getTtsProvider(id);
    if (p) return p;
  }
  if (!category || category === "music") {
    const p = getMusicProvider(id);
    if (p) return p;
  }
  return undefined;
}

function requestFor(provider: MediaProvider, env: Record<string, string | undefined>): HttpRequestSpec {
  return provider.category === "video" ? buildVideoRequest(provider, sampleVideo, env)
    : provider.category === "image" ? buildImageRequest(provider, sampleImage, env)
    : provider.category === "tts" ? buildTtsRequest(provider, sampleSpeech, env)
    : buildMusicRequest(provider, sampleMusic, env);
}

function defaultFetch(): ProviderFetch {
  return async (url, init) => {
    const resp = await globalThis.fetch(url, { method: init.method, headers: init.headers, body: init.body });
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.json(),
      text: async () => resp.text(),
      arrayBuffer: async () => resp.arrayBuffer(),
    };
  };
}

async function defaultDownload(url: string): Promise<Uint8Array> {
  const resp = await globalThis.fetch(url);
  if (!resp.ok) throw new Error(`download failed: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

export async function runProviderSmoke(options: ProviderSmokeOptions): Promise<ProviderSmokeResult> {
  const env = options.env ?? process.env;
  const provider = providerById(options.providerId, options.category);
  if (!provider) throw new Error(`unknown provider: ${options.providerId}`);

  const drySecrets = options.live ? env : { ...env, ...fakeSecrets(provider) };
  const request = requestFor(provider, drySecrets);
  const redactedRequest = redactProviderRequest(request);
  const credentialPresent = Boolean(provider.authEnv && env[provider.authEnv]);
  const base = {
    providerId: provider.id,
    category: provider.category,
    authEnv: provider.authEnv,
    credentialPresent,
    request,
    redactedRequest,
  };

  if (!options.live) {
    return {
      ok: true,
      mode: "dry-run",
      ...base,
      nextStep: `Set ${provider.authEnv ?? "the provider credential"} and rerun with --live plus MONTARA_LIVE_PROVIDER_SMOKE=1 to spend a real request.`,
    };
  }

  if (env.MONTARA_LIVE_PROVIDER_SMOKE !== "1") {
    return {
      ok: false,
      mode: "blocked",
      ...base,
      error: "live provider smoke is disabled",
      nextStep: "Set MONTARA_LIVE_PROVIDER_SMOKE=1 for an explicit paid/network opt-in.",
    };
  }
  if (provider.authEnv && !credentialPresent) {
    return {
      ok: false,
      mode: "blocked",
      ...base,
      error: `missing ${provider.authEnv}`,
      nextStep: `Set ${provider.authEnv} before running the live smoke.`,
    };
  }

  const execution = await executeProviderRequest(provider, request, {
    fetch: options.fetch ?? defaultFetch(),
    download: options.download ?? defaultDownload,
    outPath: options.outPath,
    maxPolls: 4,
  });
  return { ok: execution.ok, mode: "live", ...base, execution, error: execution.error };
}
