import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import type { ScenePlan, Timeline } from "../../core/src/index";
import { validateTimeline, scenePlanToTimeline, pictureInPicture, collage, type Corner, type MediaSpec } from "../../core/src/index";
import { renderScenePlan, renderTimeline, compositeTimeline, probeDuration, mediaBin, masterAudio, generateThumbnails, cutShorts, buildReel, type Caption, type ThumbConcept } from "../../render-ffmpeg/src/index";
import { composeScenePlan, renderComposedScenePlan } from "../../render-remotion/src/index";
import { listPipelines, planVideo } from "../../ai/src/index";
import { listProviderTools, listVideoProviders, listImageProviders, listTtsProviders, listMusicProviders, providerAvailable, buildProviderAuditReport, sanitizeProviderAuditReport, writeProviderAuditReport, runProviderSmoke, type MediaCategory } from "../../providers/src/index";
import { preComposeGate, postRenderSelfReview, writeSelfReview, directScene, directScript, reviewSourceMedia, planReelTreatment, createReelArtifacts, type ReelInputKind, type ReelStyleMode, type SceneEmotion } from "../../quality/src/index";
import { TTSSelector } from "../../tools/src/audio/tts-selector";
import { runResearch } from "../../research/src/index";
import { analyzeReferenceVideo, understandVideo, type VideoUnderstanding } from "../../understand/src/index";
import { listEngines, engineReallyAvailable, recommendEngine, autoRenderScene } from "../../render-engines/src/index";
import { listStyles, listOutputProfiles } from "../../style/src/index";
import { writePipelineManifests, writeSchemas, writeAssistantConfigs, SKILLS_ENTRY, listSkills, findSkills } from "../../agent/src/index";
import { runDoctor } from "./doctor";
import { engineReady, engineVerify, engineComposition, engineCompositionNames, engineCompositionToTimeline, renderBridged, engineProviders, engineSelfcheck, engineCompliance, findPython as findEnginePython } from "../../engine/src/index";
import { blenderAvailable, renderBlenderScene } from "../../render-blender/src/index";
import { threeAvailable, renderThreeScene } from "../../render-three/src/index";
import { manimAvailable, renderManimScene } from "../../render-manim/src/index";
import { exportTimeline, importTimeline, detectEditorFormat, type EditorFormat } from "../../bridge/src/index";
import { brainCatalogue, ollamaInstalled, ollamaModelsSync, ollamaCompleteSync } from "../../llm/src/index";
import { voiceIdAvailable, voiceCompare, voiceVerify, qaPlayback, transcribeAvailable, localTranscribe, analyzeMusic, planSceneMappedMusic, speakerIntelligenceStatus, findDialogueByVoice } from "../../hear/src/index";
import { listRuntimes, runtimeStatusReport, runtimeInstallPlan, type RuntimeId } from "../../runtimes/src/index";

interface MakeArgs {
  pipelineId: string;
  idea: string;
  targetSeconds?: number;
}

function parseMakeArgs(rest: string[]): MakeArgs {
  let pipelineId = "animated-explainer";
  let targetSeconds: number | undefined;
  const ideaParts: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (a === "--pipeline" || a === "-p") {
      const v = rest[++i];
      if (v) pipelineId = v;
    } else if (a.startsWith("--pipeline=")) {
      pipelineId = a.slice("--pipeline=".length);
    } else if (a === "--seconds" || a === "-s") {
      const v = rest[++i];
      if (v) targetSeconds = Number(v);
    } else if (a.startsWith("--seconds=")) {
      targetSeconds = Number(a.slice("--seconds=".length));
    } else {
      ideaParts.push(a);
    }
  }
  return { pipelineId, idea: ideaParts.join(" "), targetSeconds };
}

function slug(input: string): string {
  const s = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return s || "montara-video";
}

function fallbackPlan(idea: string): ScenePlan {
  const clean = idea.trim() || "Montara compose core";
  return {
    width: 1280,
    height: 720,
    fps: 30,
    scenes: [
      { id: "hook", title: clean.slice(0, 54), durationSec: 1.4, background: "101820" },
      { id: "compose", title: "Scene plan -> Timeline IR", durationSec: 1.6, background: "214f4b" },
      { id: "render", title: "Composed and encoded locally", durationSec: 1.4, background: "7c3f58" },
    ],
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readJsonRecord(path: string): Record<string, unknown> {
  const value = readJson(path);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`expected a JSON object: ${path}`);
  }
  return value as Record<string, unknown>;
}

function isTimeline(value: unknown): value is Timeline {
  return Boolean(
    value &&
      typeof value === "object" &&
      "composition" in value &&
      "tracks" in value &&
      Array.isArray((value as { tracks?: unknown }).tracks),
  );
}

function isScenePlan(value: unknown): value is ScenePlan {
  return Boolean(
    value &&
      typeof value === "object" &&
      "scenes" in value &&
      Array.isArray((value as { scenes?: unknown }).scenes),
  );
}

function renderFile(inputPath: string, outPath: string): string {
  const input = readJson(inputPath);
  mkdirSync(dirname(outPath), { recursive: true });
  if (isTimeline(input)) return renderTimeline(input, outPath);
  if (isScenePlan(input)) return renderScenePlan(input, outPath);
  throw new Error(`unsupported input JSON: ${inputPath}`);
}

function pythonModuleAvailable(moduleName: string): boolean {
  const r = spawnSync("python", ["-c", `import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('${moduleName}') else 1)`], { encoding: "utf8" });
  return r.status === 0;
}

function optionValue(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else if (arg === name && args[i + 1]) {
      values.push(args[i + 1]!);
      i++;
    }
  }
  return values;
}

function numberOption(args: string[], name: string, fallback: number): number {
  const raw = optionValue(args, name);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const VALUE_FLAGS = new Set([
  "--url",
  "--output",
  "--out",
  "--category",
  "--provider",
  "--auth-state",
  "--auth",
  "--duration",
  "--seconds",
  "--width",
  "--height",
  "--fps",
  "--assets",
  "--asset-manifest",
  "--proposal",
  "--profile",
  "--operation",
  "--runtime",
  "--audio",
  "--subtitles",
  "--subtitle",
  "--transcript",
  "--script",
  "--report",
  "--query",
  "--source",
  "--max-new",
  "--per-source",
  "--thumbs",
  "--kind",
  "--orientation",
  "--min-duration",
  "--max-duration",
  "--min-width",
  "--k",
  "--motion-min",
  "--tag-weight",
  "--seed",
  "--clip-id",
  "--n",
  "--diversity",
  "--candidate-pool",
  "--region",
  "--since",
  "--timeout",
  "--to",
]);

function positionalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg.startsWith("--")) {
      if (!arg.includes("=") && VALUE_FLAGS.has(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function parseRegion(value: string | undefined): { x: number; y: number; width: number; height: number } | undefined {
  if (!value) return undefined;
  const parts = value.split(/[,:x]/).map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [x, y, width, height] = parts as [number, number, number, number];
  return { x, y, width, height };
}

function maybeNumberOption(args: string[], name: string): number | undefined {
  const raw = optionValue(args, name);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function splitOptionList(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

type StatusLevel = "done" | "partial" | "planned";
type ComparisonVerdict = "montara-ahead" | "tie" | "upstream-ahead";

interface GateSnapshot {
  command: string;
  result: string;
}

interface StatusCapability {
  id: string;
  label: string;
  status: StatusLevel;
  evidence: string[];
  next?: string;
}

interface StatusComparison {
  category: string;
  upstream: string;
  montara: string;
  verdict: ComparisonVerdict;
}

interface MontaraStatusReport {
  generatedAt: string;
  source: string;
  summary: {
    done: number;
    partial: number;
    planned: number;
    verdict: string;
  };
  gates: GateSnapshot[];
  capabilities: StatusCapability[];
  renderEngines: {
    id: string;
    maturity: string;
    available: boolean;
    role: string;
  }[];
  providers: {
    total: number;
    available: number;
    cloud: number;
    localOrStock: number;
  };
  skills: {
    total: number;
    keyDocs: string[];
  };
  upstreamComparison: StatusComparison[];
  nextTasks: string[];
}

function readLatestGateSnapshot(): GateSnapshot[] {
  const readme = join(process.cwd(), "README.md");
  if (!existsSync(readme)) return [];
  const text = readFileSync(readme, "utf8");
  const marker = text.indexOf("Latest local gate snapshot");
  if (marker < 0) return [];
  const nextSection = text.indexOf("\n## ", marker + 1);
  const gateSection = text.slice(marker, nextSection < 0 ? undefined : nextSection);
  const rows: GateSnapshot[] = [];
  const re = /\| `([^`]+)` \| ([^|]+) \|/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(gateSection))) {
    rows.push({ command: match[1] ?? "", result: (match[2] ?? "").trim() });
  }
  return rows.filter((row) => row.command.length > 0 && row.command !== "Command");
}

function statusCounts(items: StatusCapability[]): { done: number; partial: number; planned: number } {
  return {
    done: items.filter((item) => item.status === "done").length,
    partial: items.filter((item) => item.status === "partial").length,
    planned: items.filter((item) => item.status === "planned").length,
  };
}

function docExists(path: string): boolean {
  return existsSync(join(process.cwd(), path));
}

function editorBridgeOk(): boolean {
  const timeline = scenePlanToTimeline({
    width: 1280,
    height: 720,
    fps: 30,
    scenes: [{ id: "status", title: "Montara status", durationSec: 1, background: "101820" }],
  });
  if (validateTimeline(timeline).length) return false;
  try {
    const formats: EditorFormat[] = ["edl", "otio", "fcpxml"];
    return formats.every((format) => exportTimeline(timeline, format, { title: "Montara Status" }).content.length > 20);
  } catch {
    return false;
  }
}

function buildMontaraStatusReport(): MontaraStatusReport {
  const engines = listEngines().map((engine) => ({
    id: engine.id,
    maturity: engine.maturity,
    available: engineReallyAvailable(engine.id),
    role: engine.role,
  }));
  const providers = [
    ...listVideoProviders(true),
    ...listImageProviders(true),
    ...listTtsProviders(true),
    ...listMusicProviders(true),
  ];
  const skills = listSkills();
  const pipelineCount = listPipelines().length;
  const python = engineReady();
  const brainBackends = brainCatalogue();
  const docsReady = ["README.md", "AGENT_GUIDE.md", "docs/DEMOS.md", "PROMPT_GALLERY.md", "docs/LAUNCH-PLAN.md"].every(docExists);
  const providerAuditReady = buildProviderAuditReport().invalid === 0;
  const ffmpeg = engines.find((engine) => engine.id === "ffmpeg");
  const remotion = engines.find((engine) => engine.id === "remotion");
  const hyperframesDoc = docExists("skills/core/hyperframes.md") || docExists(".agents/skills/hyperframes/SKILL.md");
  const launchPlan = docExists("docs/LAUNCH-PLAN.md");
  const editorOk = editorBridgeOk();
  const capabilities: StatusCapability[] = [
    {
      id: "timeline-ir",
      label: "Timeline IR",
      status: "done",
      evidence: ["scene plans compile to Timeline IR", "Timeline validation is available in @montara/core"],
    },
    {
      id: "scene-decision-bridge",
      label: "scene_plan/edit_decisions bridge",
      status: "done",
      evidence: ["scene_plan and edit_decisions bridge into the Timeline IR"],
    },
    {
      id: "ffmpeg-render",
      label: "FFmpeg render and fallback",
      status: ffmpeg?.available ? "done" : "partial",
      evidence: [`ffmpeg engine ${ffmpeg?.available ? "available" : "not currently available"}`, "validate renders real MP4s"],
    },
    {
      id: "native-composition",
      label: "Native composition engines",
      status: "partial",
      evidence: [
        `${engines.length} engines registered`,
        `Remotion ${remotion?.available ? "available" : "runtime-gated"}`,
        "Revideo, Motion Canvas, Three.js, Manim, Blender, Spline, Playwright are tracked by maturity",
      ],
      next: "Finish Remotion default Timeline routing and native package work for Revideo/Motion Canvas.",
    },
    {
      id: "python-engine",
      label: "Python media engine bridge",
      status: python.ready ? "done" : "partial",
      evidence: python.ready && python.info
        ? [`${python.info.tools} tools`, `${python.info.lib} lib modules`, `${python.info.pipelines.length} pipelines`]
        : [`not fully ready: ${python.reasons.join("; ")}`],
    },
    {
      id: "providers",
      label: "Cloud/local provider surface",
      status: "partial",
      evidence: [
        `${providers.length} registered provider entries`,
        `${providers.filter((provider) => providerAvailable(provider)).length} currently available with local env`,
        providerAuditReady ? "sanitized provider audit fixtures valid" : "provider audit fixtures have issues",
      ],
      next: "Production claims still require live BYOK smoke records.",
    },
    {
      id: "skills",
      label: "Agent skills and guidance",
      status: skills.length > 20 && docsReady ? "done" : "partial",
      evidence: [`${skills.length} skills indexed`, `${pipelineCount} pipelines registered`, docsReady ? "core docs linked" : "some docs missing"],
    },
    {
      id: "screen-capture",
      label: "Browser and desktop capture",
      status: "partial",
      evidence: ["capture CLI exists", "Playwright auth storageState workflow is documented and pytest-covered"],
      next: "Complete full screen-demo MP4 validate flow.",
    },
    {
      id: "editor-handoff",
      label: "Editor handoff",
      status: editorOk ? "done" : "partial",
      evidence: [editorOk ? "EDL, OTIO, and FCPXML export generated in memory" : "editor export check failed"],
    },
    {
      id: "understanding",
      label: "Video understanding",
      status: "partial",
      evidence: ["FFmpeg scene/audio/frame analysis works", "CLIP/BLIP local vision is still planned"],
      next: "Replace signal-only default with real local vision model path.",
    },
    {
      id: "local-brain",
      label: "Local LLM orchestration",
      status: "partial",
      evidence: [`${brainBackends.length} local brain backend definitions`, `Ollama ${ollamaInstalled() ? "installed" : "not detected"}`],
      next: "Ship a complete local orchestration loop, not just probes/catalogue.",
    },
    {
      id: "public-proof",
      label: "Public proof and launch",
      status: launchPlan ? "done" : "partial",
      evidence: ["README demo gallery", "docs/DEMOS.md artifact ledger", launchPlan ? "docs/LAUNCH-PLAN.md" : "launch plan missing"],
    },
    {
      id: "status-automation",
      label: "Compare report automation",
      status: "done",
      evidence: ["montara status emits this structured report", "JSON output is available with --json or --out"],
    },
    {
      id: "runtime-manager",
      label: "Runtime manager / web GUI",
      status: "partial",
      evidence: [`${listRuntimes().length} local generation runtimes registered`, "health/install guidance exists; one-click install remains Stage 5 work"],
      next: "Add managed install/launch automation after health probes are stable.",
    },
  ];
  const counts = statusCounts(capabilities);
  return {
    generatedAt: new Date().toISOString(),
    source: "PLAN.md + local registry probes + README gate snapshot",
    summary: {
      ...counts,
      verdict: counts.planned === 0 && counts.partial <= 2 ? "launch-ready" : "strong but still runtime-gated",
    },
    gates: readLatestGateSnapshot(),
    capabilities,
    renderEngines: engines,
    providers: {
      total: providers.length,
      available: providers.filter((provider) => providerAvailable(provider)).length,
      cloud: providers.filter((provider) => provider.tier === "cloud").length,
      localOrStock: providers.filter((provider) => provider.tier !== "cloud").length,
    },
    skills: {
      total: skills.length,
      keyDocs: ["AGENT_GUIDE.md", "skills/INDEX.md", "docs/DEMOS.md", "docs/LAUNCH-PLAN.md", "docs/PROVIDER-AUDIT.md"],
    },
    upstreamComparison: [
      {
        category: "Data model",
        upstream: "scene_plan/edit_decisions",
        montara: "Timeline IR plus scene_plan/edit_decisions bridge",
        verdict: "montara-ahead",
      },
      {
        category: "Agent skills",
        upstream: "strong source skills",
        montara: "ported skills plus Montara-specific Timeline, audit, capture, launch, and render validation guidance",
        verdict: "montara-ahead",
      },
      {
        category: "Native composition polish",
        upstream: "more battle-tested Remotion/HyperFrames path",
        montara: "native smoke and adapters, but default Timeline routing still hardening",
        verdict: "upstream-ahead",
      },
      {
        category: "Local-first proof",
        upstream: "strong demo narrative",
        montara: "validate-generated MP4s, editor exports, provider fixtures, and public proof ledger",
        verdict: "tie",
      },
      {
        category: "Provider safety",
        upstream: "provider guidance",
        montara: "redacted fixtures, dry-run smoke, explicit live BYOK opt-in",
        verdict: "montara-ahead",
      },
    ],
    nextTasks: [
      "Finish Remotion default Timeline routing.",
      "Add documentary stock-footage validate case through corpus CLI.",
      "Turn Revideo and Motion Canvas from registered/runtime-gated adapters into native validate cases.",
      "Ship real local CLIP/BLIP understanding path.",
      "Build the Stage 5 runtime manager and web GUI.",
    ],
  };
}

function printStatusReport(report: MontaraStatusReport): void {
  console.log(`Montara status: ${report.summary.done} done, ${report.summary.partial} partial, ${report.summary.planned} planned`);
  console.log(`Verdict: ${report.summary.verdict}`);
  if (report.gates.length) {
    console.log("\nLatest documented gates:");
    for (const gate of report.gates) console.log(`  ${gate.command.padEnd(28)} ${gate.result}`);
  }
  console.log("\nCapabilities:");
  for (const cap of report.capabilities) {
    console.log(`  ${cap.status.padEnd(7)} ${cap.label}`);
    for (const evidence of cap.evidence.slice(0, 2)) console.log(`          - ${evidence}`);
    if (cap.next) console.log(`          next: ${cap.next}`);
  }
  console.log("\nRender engines:");
  for (const engine of report.renderEngines) {
    console.log(`  ${engine.id.padEnd(14)} ${engine.maturity.padEnd(13)} ${engine.available ? "available" : "runtime-gated"} - ${engine.role}`);
  }
  console.log(`\nProviders: ${report.providers.total} total, ${report.providers.cloud} cloud, ${report.providers.localOrStock} local/stock, ${report.providers.available} available now`);
  console.log(`Skills: ${report.skills.total} indexed`);
  console.log("\nUpstream comparison:");
  for (const row of report.upstreamComparison) {
    console.log(`  ${row.verdict.padEnd(17)} ${row.category}`);
  }
  console.log("\nNext:");
  for (const task of report.nextTasks.slice(0, 3)) console.log(`  - ${task}`);
}

function runStatusCommand(rest: string[]): number {
  const report = buildMontaraStatusReport();
  const out = optionValue(rest, "--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (rest.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printStatusReport(report);
    if (out) console.log(`\nreport -> ${out}`);
  }
  return 0;
}

async function runRuntimesCommand(rest: string[]): Promise<number> {
  const sub = rest[0] ?? "status";
  const json = rest.includes("--json");
  const probe = !rest.includes("--no-probe");
  if (sub === "install-plan") {
    const id = positionalArgs(rest).slice(1)[0] as RuntimeId | undefined;
    if (!id) {
      console.error("usage: montara runtimes install-plan <comfyui|a1111>");
      return 1;
    }
    const steps = runtimeInstallPlan(id);
    if (!steps.length) {
      console.error(`unknown runtime: ${id}`);
      return 1;
    }
    if (json) {
      console.log(JSON.stringify({ id, steps }, null, 2));
    } else {
      console.log(`${id} install plan:`);
      steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
    }
    return 0;
  }
  if (sub !== "status" && sub !== "doctor" && sub !== "health") {
    console.error("usage: montara runtimes [status|doctor|health] [--json] [--out path] [--no-probe]");
    console.error("       montara runtimes install-plan <comfyui|a1111>");
    return 1;
  }
  const report = await runtimeStatusReport({ probe });
  const out = optionValue(rest, "--out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`runtimes: ${report.summary.reachable}/${report.summary.total} reachable, ${report.summary.configured} configured`);
    for (const runtime of report.runtimes) {
      console.log(`  ${runtime.id.padEnd(8)} ${runtime.status.padEnd(14)} ${runtime.url}`);
      if (runtime.error) console.log(`           ${runtime.error}`);
    }
    if (out) console.log(`report -> ${out}`);
  }
  return report.runtimes.some((runtime) => runtime.status === "unreachable") ? 1 : 0;
}

interface PythonToolResult {
  success: boolean;
  data: Record<string, unknown>;
  artifacts: string[];
  error?: string | null;
  cost_usd?: number;
  duration_seconds?: number;
}

function pythonEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, PYTHONIOENCODING: "utf-8" };
  const localPackages = join(process.cwd(), ".python-packages");
  if (process.env.MONTARA_INCLUDE_LOCAL_PYTHON_PACKAGES === "1" && existsSync(localPackages)) {
    const pathDelimiter = process.platform === "win32" ? ";" : ":";
    env.PYTHONPATH = [localPackages, env.PYTHONPATH].filter(Boolean).join(pathDelimiter);
  }
  return env;
}

function pythonCandidates(): string[] {
  const userProfile = process.env.USERPROFILE;
  return [
    process.env.MONTARA_PYTHON,
    process.env.PYTHON,
    join(process.cwd(), ".venv", "Scripts", "python.exe"),
    join(process.cwd(), "venv", "Scripts", "python.exe"),
    userProfile ? join(userProfile, "anaconda3", "python.exe") : undefined,
    userProfile ? join(userProfile, "miniconda3", "python.exe") : undefined,
    findEnginePython() ?? undefined,
    "python",
    "python3",
    "py",
  ].filter((cand, idx, all): cand is string => Boolean(cand) && all.indexOf(cand) === idx);
}

function pythonCanImport(py: string, modules: string[]): boolean {
  const code = [
    "import importlib.util, sys",
    `mods = ${JSON.stringify(modules)}`,
    "sys.exit(0 if all(importlib.util.find_spec(m) for m in mods) else 1)",
  ].join("\n");
  const r = spawnSync(py, ["-c", code], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: pythonEnv(),
    timeout: 15_000,
    maxBuffer: 1 << 20,
  });
  return r.status === 0;
}

function findPythonFor(requiredModules: string[] = []): string | null {
  for (const cand of pythonCandidates()) {
    if (!requiredModules.length) {
      const r = spawnSync(cand, ["--version"], { encoding: "utf8", timeout: 10_000 });
      if (r.status === 0) return cand;
      continue;
    }
    if (pythonCanImport(cand, requiredModules)) return cand;
  }
  return null;
}

function parsePythonToolJson(stdout: string, stderr: string): PythonToolResult {
  const text = (stdout || "").trim();
  const jsonLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  try {
    return JSON.parse(jsonLine ?? text) as PythonToolResult;
  } catch {
    return { success: false, data: {}, artifacts: [], error: `non-JSON tool output: ${(stdout || stderr || "").slice(-1000)}` };
  }
}

function runPythonTool(
  toolName: string,
  inputs: Record<string, unknown>,
  timeoutMs = 120_000,
  discoverModules: string[] = ["tools.capture"],
): PythonToolResult {
  const py = findPythonFor(["tools.tool_registry"]);
  if (!py) return { success: false, data: {}, artifacts: [], error: "Python 3 not found on PATH" };
  const code = [
    "import json, sys",
    "from tools.tool_registry import registry",
    "payload = json.loads(sys.stdin.read() or '{}')",
    "for package_name in json.loads(sys.argv[2]):",
    "    registry.ensure_discovered(package_name)",
    "tool = registry.get(sys.argv[1])",
    "if tool is None:",
    "    print(json.dumps({'success': False, 'data': {}, 'artifacts': [], 'error': f'tool not found: {sys.argv[1]}'}))",
    "    sys.exit(0)",
    "result = tool.execute(payload)",
    "print(json.dumps({",
    "    'success': bool(result.success),",
    "    'data': result.data or {},",
    "    'artifacts': result.artifacts or [],",
    "    'error': result.error,",
    "    'cost_usd': result.cost_usd,",
    "    'duration_seconds': result.duration_seconds,",
    "}, default=str))",
  ].join("\n");
  const proc = spawnSync(py, ["-c", code, toolName, JSON.stringify(discoverModules)], {
    cwd: process.cwd(),
    input: JSON.stringify(inputs),
    encoding: "utf8",
    env: pythonEnv(),
    timeout: timeoutMs,
    maxBuffer: 1 << 22,
  });
  if (proc.error) {
    return { success: false, data: {}, artifacts: [], error: proc.error.message };
  }
  if (proc.status !== 0) {
    return { success: false, data: {}, artifacts: [], error: (proc.stderr || `python exited ${proc.status}`).trim().slice(-1000) };
  }
  return parsePythonToolJson(proc.stdout || "", proc.stderr || "");
}

function runPythonToolInfo(toolName: string, discoverModules: string[] = ["tools.capture"], timeoutMs = 120_000): PythonToolResult {
  const py = findPythonFor(["tools.tool_registry"]);
  if (!py) return { success: false, data: {}, artifacts: [], error: "Python 3 not found on PATH" };
  const code = [
    "import json, sys",
    "from tools.tool_registry import registry",
    "for package_name in json.loads(sys.argv[2]):",
    "    registry.ensure_discovered(package_name)",
    "tool = registry.get(sys.argv[1])",
    "if tool is None:",
    "    print(json.dumps({'success': False, 'data': {}, 'artifacts': [], 'error': f'tool not found: {sys.argv[1]}'}))",
    "    sys.exit(0)",
    "info = tool.get_info()",
    "info['status'] = tool.get_status().value",
    "print(json.dumps({'success': True, 'data': info, 'artifacts': [], 'error': None, 'cost_usd': 0.0, 'duration_seconds': 0.0}, default=str))",
  ].join("\n");
  const proc = spawnSync(py, ["-c", code, toolName, JSON.stringify(discoverModules)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: pythonEnv(),
    timeout: timeoutMs,
    maxBuffer: 1 << 22,
  });
  if (proc.error) {
    return { success: false, data: {}, artifacts: [], error: proc.error.message };
  }
  if (proc.status !== 0) {
    return { success: false, data: {}, artifacts: [], error: (proc.stderr || `python exited ${proc.status}`).trim().slice(-1000) };
  }
  return parsePythonToolJson(proc.stdout || "", proc.stderr || "");
}

function runPythonSnippet(code: string, args: string[] = [], inputJson?: string, timeoutMs = 120_000, requiredModules: string[] = []): PythonToolResult {
  const py = findPythonFor(requiredModules);
  if (!py) return { success: false, data: {}, artifacts: [], error: requiredModules.length ? `Python 3 with required modules not found: ${requiredModules.join(", ")}` : "Python 3 not found on PATH" };
  const proc = spawnSync(py, ["-c", code, ...args], {
    cwd: process.cwd(),
    input: inputJson,
    encoding: "utf8",
    env: pythonEnv(),
    timeout: timeoutMs,
    maxBuffer: 1 << 22,
  });
  if (proc.error) return { success: false, data: {}, artifacts: [], error: proc.error.message };
  if (proc.status !== 0) return { success: false, data: {}, artifacts: [], error: (proc.stderr || `python exited ${proc.status}`).trim().slice(-1000) };
  return parsePythonToolJson(proc.stdout || "", proc.stderr || "");
}

function printPythonToolResult(result: PythonToolResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.success) {
    console.error(result.error || "tool failed");
    return;
  }
  for (const [key, value] of Object.entries(result.data)) {
    if (Array.isArray(value) || (value && typeof value === "object")) continue;
    console.log(`${key}: ${String(value)}`);
  }
  for (const artifact of result.artifacts) console.log(`artifact: ${artifact}`);
}

function runCaptureCommand(rest: string[]): number {
  const subcommands = new Set(["recommend", "status", "setup", "login", "auth", "record", "pick-latest"]);
  const requested = rest[0] && subcommands.has(rest[0]) ? rest[0] : undefined;
  const args = requested ? rest.slice(1) : rest;
  const inferredSub = optionValue(args, "--url") || positionalArgs(args)[0]?.startsWith("http") ? "record" : "recommend";
  const sub = requested ?? inferredSub;
  const json = args.includes("--json");
  const positional = positionalArgs(args);
  const positionalUrl = positional.find((arg) => /^https?:\/\//i.test(arg));
  const url = optionValue(args, "--url") ?? positionalUrl;
  const authStatePath = optionValue(args, "--auth-state") ?? optionValue(args, "--auth");
  const provider = optionValue(args, "--provider") ?? (url ? "playwright" : "auto");
  const durationSeconds = numberOption(args, "--duration", numberOption(args, "--seconds", 20));
  const width = numberOption(args, "--width", 1920);
  const height = numberOption(args, "--height", 1080);
  const fps = numberOption(args, "--fps", 30);
  const headless = !args.includes("--headful");
  const output = optionValue(args, "--output") ??
    positional.find((arg) => arg !== positionalUrl && !/^https?:\/\//i.test(arg)) ??
    join(process.cwd(), "out", url ? "browser-capture.mp4" : "screen-capture.mp4");

  if (sub === "status" || sub === "recommend") {
    const result = runPythonTool("screen_capture_selector", {
      operation: "recommend",
      preferred_provider: provider,
      url,
      auth_state_path: authStatePath,
    });
    if (json) {
      printPythonToolResult(result, true);
      return result.success ? 0 : 1;
    }
    if (!result.success) {
      console.error(result.error || "capture recommendation failed");
      return 1;
    }
    const recommended = result.data.recommended_provider;
    console.log(`capture recommendation: ${recommended ?? "unknown"}`);
    if (typeof result.data.message === "string") console.log(result.data.message);
    return 0;
  }

  if (sub === "setup") {
    const tool = provider === "cap" ? "cap_recorder" : "playwright_recorder";
    const result = runPythonTool(tool, { operation: "setup_guide" });
    printPythonToolResult(result, json);
    return result.success ? 0 : 1;
  }

  if (sub === "login" || sub === "auth") {
    if (!url) {
      console.error("usage: montara capture login --url <url> [--auth-state projects/<name>/auth/playwright-auth.json] [--timeout 180]");
      return 1;
    }
    const loginTimeout = numberOption(args, "--timeout", 180);
    const result = runPythonTool("playwright_recorder", {
      operation: "interactive_login",
      url,
      auth_state_path: authStatePath ?? join("projects", "auth", "playwright-auth.json"),
      login_timeout_seconds: loginTimeout,
      width,
      height,
    }, (loginTimeout + 60) * 1000);
    if (json) {
      printPythonToolResult(result, true);
    } else if (result.success) {
      console.log(`auth state -> ${String(result.data.auth_state_path ?? "")}`);
      console.log("review and keep this storageState file out of git; it may contain private session cookies.");
    } else {
      console.error(result.error || "interactive login failed");
    }
    return result.success ? 0 : 1;
  }

  if (sub === "pick-latest") {
    const result = runPythonTool("screen_capture_selector", {
      operation: "pick_latest",
      since_minutes: numberOption(args, "--since", 5),
      output_path: output,
    });
    printPythonToolResult(result, json);
    return result.success ? 0 : 1;
  }

  if (sub === "record") {
    if (provider === "playwright" && !url) {
      console.error("usage: montara capture --url <url> [out.mp4] [--auth-state path] [--duration 20] [--headful]");
      return 1;
    }
    const result = runPythonTool("screen_capture_selector", {
      operation: "record",
      preferred_provider: provider,
      url,
      output_path: output,
      auth_state_path: authStatePath,
      duration_seconds: durationSeconds,
      width,
      height,
      headless,
      fps,
      capture_audio: !args.includes("--no-audio"),
      region: parseRegion(optionValue(args, "--region")),
    }, Math.max(120_000, (durationSeconds + 180) * 1000));
    if (json) {
      printPythonToolResult(result, true);
    } else if (result.success) {
      console.log(`capture -> ${String(result.data.output_path ?? output)}`);
      if (result.data.capture_method) console.log(`method: ${String(result.data.capture_method)}`);
      if (result.data.raw_video_path) console.log(`raw: ${String(result.data.raw_video_path)}`);
      console.log("next: review the capture, then use it as source footage in a Timeline IR or reel.");
    } else {
      console.error(result.error || "capture failed");
      if (provider === "playwright") console.error("setup: montara capture setup --provider playwright");
    }
    return result.success ? 0 : 1;
  }

  console.error("usage: montara capture [recommend|status|setup|login|record|pick-latest] [--url URL] [out.mp4] [--provider auto|ffmpeg|cap|playwright]");
  return 1;
}

const VIDEO_COMPOSE_MODULE = ["tools.video.video_compose"];
const CORPUS_BUILDER_MODULE = ["tools.video.corpus_builder"];
const CLIP_SEARCH_MODULE = ["tools.video.clip_search"];

function printComposeRuntimes(result: PythonToolResult, json: boolean): number {
  if (json) {
    printPythonToolResult(result, true);
    return result.success ? 0 : 1;
  }
  if (!result.success) {
    console.error(result.error || "compose runtime discovery failed");
    return 1;
  }
  const engines = (result.data.render_engines ?? result.data.render_runtimes ?? {}) as Record<string, unknown>;
  console.log(`video_compose: ${String(result.data.status ?? "unknown")}`);
  for (const [runtime, available] of Object.entries(engines)) {
    console.log(`  ${runtime.padEnd(12)} ${available ? "available" : "unavailable"}`);
  }
  if (typeof result.data.runtime_governance === "string") console.log(`governance: ${result.data.runtime_governance}`);
  if (typeof result.data.remotion_note === "string") console.log(`remotion: ${result.data.remotion_note}`);
  if (typeof result.data.hyperframes_note === "string") console.log(`hyperframes: ${result.data.hyperframes_note}`);
  return 0;
}

function runComposeCommand(rest: string[]): number {
  const sub = rest[0];
  if (!sub || sub === "help" || sub === "--help") {
    console.error("usage: montara compose <edit-decisions.json> [out.mp4] [--assets asset-manifest.json] [--proposal proposal.json] [--operation render|compose|remotion_render] [--runtime ffmpeg|remotion|hyperframes] [--json]");
    console.error("       montara compose runtimes [--json]");
    return sub ? 0 : 1;
  }

  const json = rest.includes("--json");
  if (sub === "runtimes" || sub === "info" || sub === "status") {
    return printComposeRuntimes(runPythonToolInfo("video_compose", VIDEO_COMPOSE_MODULE), json);
  }

  const args = rest;
  const positional = positionalArgs(args);
  const editPath = positional[0];
  if (!editPath || !existsSync(editPath)) {
    console.error("usage: montara compose <edit-decisions.json> [out.mp4] [--assets asset-manifest.json] [--proposal proposal.json] [--operation render|compose|remotion_render]");
    return 1;
  }
  const out = optionValue(args, "--output") ??
    (positional[1] && !positional[1].startsWith("--") ? positional[1] : join(process.cwd(), "out", "montara-compose.mp4"));
  const assetsPath = optionValue(args, "--assets") ?? optionValue(args, "--asset-manifest");
  const proposalPath = optionValue(args, "--proposal");
  const operation = optionValue(args, "--operation") ?? (assetsPath ? "render" : "compose");
  const editDecisions = readJsonRecord(editPath);
  const runtimeOverride = optionValue(args, "--runtime");
  if (runtimeOverride) editDecisions.render_runtime = runtimeOverride;

  if (operation === "render" && !assetsPath) {
    console.error("operation=render requires --assets <asset-manifest.json>. Use --operation compose for direct source-path cuts.");
    return 1;
  }

  const payload: Record<string, unknown> = {
    operation,
    edit_decisions: editDecisions,
    output_path: out,
  };
  if (assetsPath) payload.asset_manifest = readJsonRecord(assetsPath);
  if (proposalPath) payload.proposal_packet = readJsonRecord(proposalPath);
  const profile = optionValue(args, "--profile");
  if (profile) payload.profile = profile;
  const audio = optionValue(args, "--audio");
  if (audio) payload.audio_path = audio;
  const subtitles = optionValue(args, "--subtitles") ?? optionValue(args, "--subtitle");
  if (subtitles) payload.subtitle_path = subtitles;
  const transcript = optionValue(args, "--transcript");
  if (transcript) payload.narration_transcript_path = transcript;
  const scriptPath = optionValue(args, "--script");
  if (scriptPath) payload.script_path = scriptPath;

  const result = runPythonTool("video_compose", payload, 900_000, VIDEO_COMPOSE_MODULE);
  const reportPath = optionValue(args, "--report") ?? out.replace(/\.mp4$/i, ".render-report.json");
  if (result.success || result.data && Object.keys(result.data).length) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  if (json) {
    printPythonToolResult(result, true);
    return result.success ? 0 : 1;
  }
  if (!result.success) {
    console.error(result.error || "compose failed");
    if (existsSync(reportPath)) console.error(`report: ${reportPath}`);
    return 1;
  }
  console.log(`compose -> ${String(result.data.output ?? out)}`);
  if (result.data.operation) console.log(`operation: ${String(result.data.operation)}`);
  if (result.data.final_review_status) console.log(`final_review: ${String(result.data.final_review_status)}`);
  console.log(`report: ${reportPath}`);
  for (const artifact of result.artifacts) console.log(`artifact: ${artifact}`);
  return 0;
}

function printCorpusSources(result: PythonToolResult, json: boolean): number {
  if (json) {
    printPythonToolResult(result, true);
    return result.success ? 0 : 1;
  }
  if (!result.success) {
    console.error(result.error || "corpus source discovery failed");
    return 1;
  }
  const summary = (result.data.source_provider_summary ?? {}) as Record<string, unknown>;
  console.log(`corpus_builder: ${String(result.data.status ?? "unknown")}`);
  console.log(`sources: ${String(summary.configured ?? 0)} configured / ${String(summary.total ?? 0)} total`);
  const available = Array.isArray(summary.available_source_names) ? summary.available_source_names : [];
  const unavailable = Array.isArray(summary.unavailable_source_names) ? summary.unavailable_source_names : [];
  console.log(`available: ${available.join(", ") || "none"}`);
  console.log(`unavailable: ${unavailable.join(", ") || "none"}`);
  return 0;
}

function runCorpusCommand(rest: string[]): number {
  const sub = rest[0] ?? "sources";
  const args = rest.slice(1);
  const json = args.includes("--json") || rest.includes("--json");

  if (sub === "help" || sub === "--help") {
    console.log("usage: montara corpus sources [--json]");
    console.log("       montara corpus build <corpus-dir> \"query\" [--query TEXT ...] [--source archive_org] [--max-new 20] [--per-source 10]");
    console.log("       montara corpus search <corpus-dir> \"slot description\" [--k 10] [--motion-min 0.2]");
    console.log("       montara corpus stats <corpus-dir>");
    console.log("       montara corpus get <corpus-dir> <clip-id>");
    return 0;
  }

  if (sub === "sources" || sub === "providers" || sub === "status") {
    return printCorpusSources(runPythonToolInfo("corpus_builder", CORPUS_BUILDER_MODULE), json);
  }

  if (sub === "build") {
    const positional = positionalArgs(args);
    const corpusDir = positional[0];
    const inlineQuery = positional.slice(1).join(" ").trim();
    const queryTexts = splitOptionList(optionValues(args, "--query"));
    if (inlineQuery) queryTexts.unshift(inlineQuery);
    if (!corpusDir || queryTexts.length === 0) {
      console.error("usage: montara corpus build <corpus-dir> \"query\" [--query TEXT ...] [--source archive_org] [--max-new 20]");
      return 1;
    }
    const kind = optionValue(args, "--kind") ?? "video";
    const perSource = numberOption(args, "--per-source", 10);
    const filters: Record<string, unknown> = {};
    for (const [flag, key] of [
      ["--min-duration", "min_duration"],
      ["--max-duration", "max_duration"],
      ["--min-width", "min_width"],
    ] as const) {
      const value = maybeNumberOption(args, flag);
      if (value !== undefined) filters[key] = value;
    }
    const orientation = optionValue(args, "--orientation");
    if (orientation) filters.orientation = orientation;

    const payload: Record<string, unknown> = {
      corpus_dir: corpusDir,
      queries: queryTexts.map((query) => ({ query, kind, per_source: perSource })),
      max_new_clips: numberOption(args, "--max-new", 25),
      thumbs_per_video: numberOption(args, "--thumbs", 5),
      skip_existing: !args.includes("--no-skip-existing"),
    };
    const sources = splitOptionList(optionValues(args, "--source"));
    if (sources.length) payload.sources = sources;
    if (Object.keys(filters).length) payload.filters = filters;

    const timeout = Math.max(120_000, numberOption(args, "--timeout", 900) * 1000);
    const result = runPythonTool("corpus_builder", payload, timeout, CORPUS_BUILDER_MODULE);
    if (json) {
      printPythonToolResult(result, true);
      return result.success ? 0 : 1;
    }
    if (!result.success) {
      console.error(result.error || "corpus build failed");
      return 1;
    }
    console.log(`corpus -> ${String(result.data.corpus_dir ?? corpusDir)}`);
    console.log(`added ${String(result.data.clips_added ?? 0)} clip(s), skipped ${String(result.data.clips_skipped_existing ?? 0)}, failed ${String(result.data.clips_failed ?? 0)}`);
    console.log(`sources: ${(result.data.resolved_sources as unknown[] | undefined)?.join(", ") ?? "unknown"}`);
    return 0;
  }

  if (sub === "search") {
    const positional = positionalArgs(args);
    const corpusDir = positional[0];
    const queryText = optionValue(args, "--query") ?? positional.slice(1).join(" ").trim();
    if (!corpusDir || !queryText) {
      console.error("usage: montara corpus search <corpus-dir> \"slot description\" [--k 10] [--motion-min 0.2]");
      return 1;
    }
    const payload: Record<string, unknown> = {
      operation: "rank_for_slot",
      corpus_dir: corpusDir,
      query_text: queryText,
      k: numberOption(args, "--k", 10),
      tag_weight: numberOption(args, "--tag-weight", 0.3),
    };
    const motionMin = maybeNumberOption(args, "--motion-min");
    if (motionMin !== undefined) payload.motion_min = motionMin;
    const kind = optionValue(args, "--kind");
    if (kind) payload.kind = kind;
    const result = runPythonTool("clip_search", payload, 180_000, CLIP_SEARCH_MODULE);
    if (json) {
      printPythonToolResult(result, true);
      return result.success ? 0 : 1;
    }
    if (!result.success) {
      console.error(result.error || "corpus search failed");
      return 1;
    }
    const rows = (result.data.results as Array<Record<string, unknown>> | undefined) ?? [];
    console.log(`matches: ${rows.length} from ${String(result.data.corpus_size ?? "?")} corpus rows`);
    for (const row of rows.slice(0, 10)) {
      const record = (row.record ?? {}) as Record<string, unknown>;
      console.log(`${Number(row.score ?? 0).toFixed(3)} ${String(record.clip_id ?? "")} ${String(record.local_path ?? "")}`);
    }
    return 0;
  }

  if (sub === "stats" || sub === "get" || sub === "similar") {
    const positional = positionalArgs(args);
    const corpusDir = positional[0];
    if (!corpusDir) {
      console.error(`usage: montara corpus ${sub} <corpus-dir>${sub === "get" ? " <clip-id>" : ""}`);
      return 1;
    }
    const payload: Record<string, unknown> = { corpus_dir: corpusDir, operation: sub === "similar" ? "find_similar_set" : sub };
    if (sub === "get") {
      const clipId = optionValue(args, "--clip-id") ?? positional[1];
      if (!clipId) { console.error("usage: montara corpus get <corpus-dir> <clip-id>"); return 1; }
      payload.clip_id = clipId;
    }
    if (sub === "similar") {
      const seed = optionValue(args, "--seed") ?? positional[1];
      if (!seed) { console.error("usage: montara corpus similar <corpus-dir> <seed-clip-id> [--n 5]"); return 1; }
      payload.seed_clip_id = seed;
      payload.n = numberOption(args, "--n", 5);
      payload.diversity = numberOption(args, "--diversity", 0.3);
      payload.candidate_pool = numberOption(args, "--candidate-pool", 30);
    }
    const result = runPythonTool("clip_search", payload, 120_000, CLIP_SEARCH_MODULE);
    if (json) {
      printPythonToolResult(result, true);
      return result.success ? 0 : 1;
    }
    printPythonToolResult(result, false);
    return result.success ? 0 : 1;
  }

  console.error("usage: montara corpus <sources|build|search|stats|get|similar>");
  return 1;
}

function thumbnailConcepts(args: string[], durationSec: number): ThumbConcept[] {
  const hooks = optionValue(args, "--hooks")
    ?.split("|")
    .map((h) => h.trim())
    .filter(Boolean);
  const labels = hooks?.length ? hooks : ["SOURCE TENSION", "CLEAR CONTRAST", "VIEWER STAKES"];
  return labels.slice(0, 3).map((hook, index) => ({
    hook,
    atSec: durationSec * ((index + 1) / (labels.slice(0, 3).length + 1)),
  }));
}

function runReelCommand(rest: string[]): number {
  const input = rest[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara reel <input.mp4> [out] [--prompt TEXT] [--style cinematic|warfront-documentary|minimal|kinetic-typography] [--hook TEXT] [--cta TEXT] [--no-captions] [--model base] [--simple]");
    return 1;
  }

  const out = (rest[1] && !rest[1].startsWith("--")) ? rest[1] : join(process.cwd(), "out", "montara-reel.mp4");
  const modelI = rest.indexOf("--model");
  const prompt = optionValue(rest, "--prompt") ?? optionValue(rest, "--about");
  const requestedHook = optionValue(rest, "--hook");
  const requestedCta = rest.includes("--no-cta") ? "" : optionValue(rest, "--cta");
  const requestedStyle = optionValue(rest, "--style") as ReelStyleMode | undefined;
  const inputKind = optionValue(rest, "--input-kind") as ReelInputKind | undefined;
  const simple = rest.includes("--simple");
  const noCaptions = rest.includes("--no-captions");

  console.log("reviewing source media...");
  const sourceReview = reviewSourceMedia([input]);

  let understanding: VideoUnderstanding | null = null;
  if (!rest.includes("--no-understand")) {
    console.log("understanding source (frames + pacing)...");
    try {
      understanding = understandVideo(input, { maxFrames: 5 });
      console.log(`  ${understanding.durationSec.toFixed(1)}s | ${understanding.sceneCount} scene(s) | tags ${understanding.tags.join(", ")}`);
    } catch (err) {
      console.log(`  understanding unavailable; using playback QA fallback (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const qaBefore = qaPlayback(input);
  if (!understanding) {
    understanding = {
      durationSec: qaBefore.durationSec,
      sceneCount: Math.max(1, qaBefore.sceneChanges + 1),
      frames: [],
      tags: [
        qaBefore.sceneChanges <= 1 ? "slow-cut" : "fast-cut",
        qaBefore.width < qaBefore.height ? "vertical" : "horizontal",
        qaBefore.hasAudio ? "speech-capable" : "silent",
      ],
      caption: "Fallback playback probe summary.",
      aspectBreakdown: [],
    };
  }

  const localStt = transcribeAvailable();
  let captions: Caption[] = [];
  if (!noCaptions) {
    if (localStt) {
      console.log("transcribing (local faster-whisper)...");
      const t = localTranscribe(input, { model: modelI >= 0 ? rest[modelI + 1] : "base" });
      if (t) {
        captions = t.segments.map((s) => ({ startSec: s.start, endSec: s.end, text: s.text }));
        console.log(`  ${captions.length} caption cues (${t.language}, ${t.duration}s)`);
      } else {
        console.log("  transcription failed; building reel without generated captions");
      }
    } else {
      console.log("local STT unavailable (pip install faster-whisper); building reel without generated captions");
    }
  }

  const skillHits = findSkills("reel source media understand captions edit music voice mask").slice(0, 8);
  const availableTtsProviders = listTtsProviders(true).filter((p) => p.tier === "local-free" || providerAvailable(p));
  const availableMusicProviders = listMusicProviders(true).filter((p) => p.tier === "local-free" || providerAvailable(p));
  const plan = planReelTreatment({
    understanding,
    captions,
    skills: skillHits.map((s) => ({ id: s.id, title: s.title, summary: s.summary })),
    availableVoiceProviders: new TTSSelector().availableProviders(),
    ttsProviders: availableTtsProviders,
    musicProviders: availableMusicProviders,
    capabilities: {
      localStt: localStt && !noCaptions,
      voiceId: voiceIdAvailable(),
      aiHumanMask: pythonModuleAvailable("rembg"),
      localBrain: ollamaInstalled(),
    },
    prompt,
    requestedStyle,
    inputKind,
    requestedHook,
    requestedCta,
  });
  if (simple) plan.renderOptions.smart = false;

  const planPath = out.replace(/\.mp4$/i, ".reel-plan.json");
  const timelinePath = out.replace(/\.mp4$/i, ".timeline.json");
  const editDecisionsPath = out.replace(/\.mp4$/i, ".edit-decisions.json");
  const artifacts = createReelArtifacts({ inputPath: input, understanding, plan, captions });
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(timelinePath, `${JSON.stringify(artifacts.timeline, null, 2)}\n`);
  writeFileSync(editDecisionsPath, `${JSON.stringify(artifacts.editDecisions, null, 2)}\n`);
  writeFileSync(planPath, JSON.stringify({
    source_review: sourceReview,
    reel_plan: plan,
    timeline_path: timelinePath,
    edit_decisions_path: editDecisionsPath,
  }, null, 2));

  console.log(`planning reel treatment -> ${planPath}`);
  console.log(`  style: ${plan.style}; input: ${plan.inputKind}; prompt: ${plan.promptSummary}`);
  console.log(`  intent: ${plan.editIntent.slice(0, 3).join("; ")}`);
  console.log(`  directives: ${plan.visualDirectives.slice(0, 4).map((d) => d.title).join(", ")}`);
  console.log(`  skills: ${plan.selectedSkills.map((s) => s.id).join(", ")}`);
  console.log(`  tts: ${plan.ttsDecision.id} (${plan.ttsDecision.mode}); music: ${plan.musicDecision.id} (${plan.musicDecision.mode}); mask: ${plan.maskingDecision.id} (${plan.maskingDecision.mode})`);
  console.log(`  IR: ${timelinePath}`);
  console.log(`  edit decisions: ${editDecisionsPath}`);
  console.log(`composing reel (${plan.renderOptions.smart ? "planned smart treatment" : "simple overlay treatment"} + -14 LUFS master)...`);

  const res = buildReel(input, out, {
    hook: plan.hook,
    endCard: plan.cta || undefined,
    captions,
    lufs: -14,
    smart: plan.renderOptions.smart,
    beats: plan.beats,
    style: plan.renderStyle,
    timing: plan.timing,
    timeline: artifacts.timeline,
  });
  if (!res.ok) {
    console.error(`reel failed: ${res.error}`);
    return 1;
  }
  const qa = qaPlayback(out);
  console.log(`reel -> ${out}`);
  console.log(`  ${res.captions} captions burned | ${qa.width}x${qa.height} ${qa.durationSec.toFixed(1)}s | audio ${qa.meanVolumeDb}dB/${qa.maxVolumeDb}dB peak | cuts ${qa.sceneChanges}`);
  if (qa.issues.length) console.log(`  QA notes: ${qa.issues.join("; ")}`);
  return res.ok ? 0 : 1;
}

const BUDGET_SNIPPET = [
  "import json, sys",
  "from pathlib import Path",
  "from tools.cost_tracker import CostTracker, ApprovalRequiredError, BudgetExceededError",
  "from lib.config_model import BudgetMode",
  "op = sys.argv[1]",
  "p = json.loads(sys.stdin.read() or '{}')",
  "log = Path(p['log'])",
  "mode = BudgetMode(p.get('mode', 'warn'))",
  "t = CostTracker(budget_total_usd=float(p.get('total', 10.0)), mode=mode, cost_log_path=log)",
  "note = None",
  "entry_id = None",
  "try:",
  "    if op == 'estimate':",
  "        entry_id = t.estimate(p['tool'], p['operation'], float(p['usd']))",
  "    elif op == 'reserve':",
  "        if p.get('approve'):",
  "            ent = t._find(p['entry_id'])",
  "            t.approve_tool(ent['tool'])",
  "        t.reserve(p['entry_id'])",
  "    elif op == 'reconcile':",
  "        t.reconcile(p['entry_id'], float(p['actual']), success=bool(p.get('success', True)))",
  "    elif op == 'refund':",
  "        t.refund(p['entry_id'])",
  "except (ApprovalRequiredError, BudgetExceededError) as e:",
  "    note = f'{type(e).__name__}: {e}'",
  "snap = t.cost_snapshot()",
  "out = {",
  "    'success': note is None,",
  "    'data': {",
  "        'budget_total_usd': t.budget_total_usd,",
  "        'usable_budget_usd': round(t.usable_budget_usd, 4),",
  "        'snapshot': snap,",
  "        'entries': t.entries,",
  "        'entry_id': entry_id,",
  "        'note': note,",
  "    },",
  "    'artifacts': [str(log)],",
  "    'error': note,",
  "}",
  "print(json.dumps(out, default=str))",
].join("\n");

function runBudgetCommand(rest: string[]): number {
  const sub = rest[0] && !rest[0].startsWith("--") ? rest[0] : "show";
  const args = rest;
  const json = args.includes("--json");
  const log = optionValue(args, "--log") ?? join(process.cwd(), "out", "cost_log.json");
  const total = numberOption(args, "--total", 10);
  const mode = optionValue(args, "--mode") ?? "warn";
  const positional = positionalArgs(args).slice(1); // drop the subcommand

  const payload: Record<string, unknown> = { log, total, mode };
  if (sub === "estimate") {
    const [tool, operation, usd] = positional;
    if (!tool || !operation || usd == null) {
      console.error("usage: montara budget estimate <tool> <operation> <usd> [--log path] [--total N]");
      return 1;
    }
    payload.tool = tool; payload.operation = operation; payload.usd = Number(usd);
  } else if (sub === "reserve") {
    const entryId = positional[0];
    if (!entryId) { console.error("usage: montara budget reserve <entry-id> [--approve] [--mode observe|warn|cap]"); return 1; }
    payload.entry_id = entryId;
    payload.approve = args.includes("--approve");
  } else if (sub === "reconcile") {
    const [entryId, actual] = positional;
    if (!entryId || actual == null) { console.error("usage: montara budget reconcile <entry-id> <actual-usd> [--fail]"); return 1; }
    payload.entry_id = entryId; payload.actual = Number(actual); payload.success = !args.includes("--fail");
  } else if (sub === "refund") {
    const entryId = positional[0];
    if (!entryId) { console.error("usage: montara budget refund <entry-id>"); return 1; }
    payload.entry_id = entryId;
  } else if (sub !== "show") {
    console.error("usage: montara budget [show|estimate|reserve|reconcile|refund] ...");
    return 1;
  }

  const result = runPythonSnippet(BUDGET_SNIPPET, [sub], JSON.stringify(payload), 120_000, ["tools.cost_tracker", "lib.config_model"]);
  if (json) { console.log(JSON.stringify(result, null, 2)); return result.success ? 0 : 1; }
  if (!result.data || !result.data.snapshot) {
    console.error(result.error || "budget command failed");
    return 1;
  }
  const snap = result.data.snapshot as Record<string, number>;
  console.log(`budget: $${Number(result.data.budget_total_usd).toFixed(2)} total | spent $${snap.total_spent_usd?.toFixed(2)} | reserved $${snap.total_reserved_usd?.toFixed(2)} | remaining $${snap.budget_remaining_usd?.toFixed(2)} | usable $${Number(result.data.usable_budget_usd).toFixed(2)}`);
  if (result.data.entry_id) console.log(`entry: ${String(result.data.entry_id)}`);
  const entries = (result.data.entries as Array<Record<string, unknown>>) ?? [];
  for (const e of entries.slice(-12)) {
    console.log(`  ${String(e.id)} ${String(e.status).padEnd(10)} ${String(e.tool).padEnd(16)} est $${Number(e.estimated_usd).toFixed(2)} resv $${Number(e.reserved_usd).toFixed(2)} act $${Number(e.actual_usd).toFixed(2)}`);
  }
  if (result.data.note) { console.error(`blocked: ${String(result.data.note)} (use --approve, or --mode observe to override)`); return 1; }
  console.log(`log: ${log}`);
  return 0;
}

const RESUME_SNIPPET = [
  "import json, sys",
  "from pathlib import Path",
  "from lib.checkpoint import get_latest_checkpoint, get_completed_stages, get_next_stage, get_pipeline_stages",
  "p = json.loads(sys.stdin.read() or '{}')",
  "pipeline_dir = Path(p['pipeline_dir'])",
  "project_id = p['project_id']",
  "ptype = p.get('pipeline_type')",
  "latest = get_latest_checkpoint(pipeline_dir, project_id)",
  "if ptype is None and latest:",
  "    ptype = latest.get('pipeline_type') if latest.get('pipeline_type') not in (None, 'unknown') else None",
  "completed = get_completed_stages(pipeline_dir, project_id, ptype)",
  "nxt = get_next_stage(pipeline_dir, project_id, ptype)",
  "out = {",
  "    'success': latest is not None,",
  "    'data': {",
  "        'project_id': project_id,",
  "        'pipeline_type': ptype,",
  "        'stages': get_pipeline_stages(ptype),",
  "        'completed': completed,",
  "        'next_stage': nxt,",
  "        'latest_stage': latest.get('stage') if latest else None,",
  "        'latest_status': latest.get('status') if latest else None,",
  "        'done': nxt is None,",
  "    },",
  "    'artifacts': [],",
  "    'error': None if latest else f'no checkpoints found for project {project_id!r} under {pipeline_dir}',",
  "}",
  "print(json.dumps(out, default=str))",
].join("\n");

function runResumeCommand(rest: string[]): number {
  const args = rest;
  const json = args.includes("--json");
  const positional = positionalArgs(args);
  const target = positional[0];
  if (!target) {
    console.error("usage: montara resume <project-dir> [--pipeline <type>]   # project-dir holds checkpoint_*.json");
    console.error("       montara resume <pipeline-dir> <project-id> [--pipeline <type>]");
    return 1;
  }
  let pipelineDir: string;
  let projectId: string;
  if (positional[1] && !positional[1].startsWith("--")) {
    pipelineDir = target;
    projectId = positional[1];
  } else {
    // treat target as the project directory itself: <pipeline-dir>/<project-id>
    const normalized = target.replace(/[\\/]+$/, "");
    pipelineDir = dirname(normalized) || ".";
    projectId = normalized.split(/[\\/]/).pop() || normalized;
  }
  const payload: Record<string, unknown> = { pipeline_dir: pipelineDir, project_id: projectId };
  const ptype = optionValue(args, "--pipeline");
  if (ptype) payload.pipeline_type = ptype;

  const result = runPythonSnippet(RESUME_SNIPPET, [], JSON.stringify(payload), 120_000, ["lib.checkpoint"]);
  if (json) { console.log(JSON.stringify(result, null, 2)); return result.success ? 0 : 1; }
  if (!result.success) { console.error(result.error || "resume failed"); return 1; }
  const d = result.data;
  console.log(`project: ${String(d.project_id)} (${String(d.pipeline_type ?? "unknown")})`);
  console.log(`latest:  ${String(d.latest_stage)} [${String(d.latest_status)}]`);
  console.log(`completed: ${(d.completed as string[] | undefined)?.join(", ") || "none"}`);
  if (d.done) {
    console.log("next: all stages complete — nothing to resume");
  } else {
    console.log(`next: resume at '${String(d.next_stage)}'`);
    console.log(`  e.g. montara make --pipeline ${String(d.pipeline_type ?? "animated-explainer")} "<idea>"  (then continue from ${String(d.next_stage)})`);
  }
  return 0;
}

function printHelp(): void {
  console.log(`montara <command>

Commands:
  doctor [--fix]                  check local render prerequisites + Python engine; print setup guide with --fix
  status [--json] [--out path]     summarize local capability, gates, and upstream parity categories
  runtimes status [--json]         health check external ComfyUI/A1111 localhost runtimes
  runtimes install-plan <id>       print safe external setup steps, without bundling runtimes
  render3d blender [out]          render the 3D intro via headless Blender + ffmpeg
  voiceid compare <test> ...      speaker-ID: classify a clip against labelled reference clips
  voiceid verify <a> <b>          speaker-ID: are two clips the same speaker?
  voiceid search <query> <corpus.json> [--line TEXT]
                                  find dialogue clips by local voice similarity + line match
  music analyze <audio>           deep local music analysis + quality gates
  music score <audio> <scenes.json>
                                  scene-mapped score cues with crossfades/silence
  engine [info|smoke]             show Python engine readiness, or run the integrity smoke
  engine timeline <name>          bridge an engine composition into Montara Timeline IR
  engine render <name> [out]      render a bridged composition to MP4 (ffmpeg; --engine remotion)
  engine providers                list engine providers + which are configured (no secrets)
  engine check                    run the engine integrity self-check battery
  engine compliance               scan source for legacy branding + hardcoded secrets
  pipelines                       list the available pipeline shapes
  tools                           list local/free provider tools
  providers [video|image|tts|music]  list generation providers + availability
  providers audit [--out path]       write sanitized request fixtures for cloud providers
  providers smoke <id> [--live]      dry-run or opt-in live-key smoke for one provider
  engines                         list composition engines + availability
  styles                          list style playbooks
  profiles                        list output profiles (aspect ratios)
  research <idea>                 plan 15-25 searches + write a research brief to ./out
  plan  [opts] <idea>             write a structured scene plan to ./out
  make  [opts] <idea>             plan + gate + compose + render + self-review to ./out
  render <ir.json>                render a ScenePlan or Timeline IR JSON to MP4
  export <ir.json> --to edl|fcpxml|otio [out]
                                  export the Timeline IR to a pro-editor interchange file
  import <file.edl|.otio|.fcpxml> [out]
                                  round-trip a pro-editor cut back into Timeline IR (auto-detects format)
  review <mp4>                    post-render self-review report for an MP4
  analyze <mp4>                   scene/understanding analysis + concept variants for a video
  capture [--url URL] [out.mp4]    record/recommend screen capture; Playwright auth via capture login
  compose <edit-decisions.json> [out.mp4]
                                  run Python video_compose; pass --assets for high-level render artifacts
  corpus <sources|build|search>    stock-footage corpus discovery, population, and retrieval
  reel <input.mp4> [out]           understand + smart-edit a source clip; writes MP4 + Timeline IR + edit decisions
  budget [show|estimate|reserve|reconcile|refund]
                                  preflight cost governance over cost_log.json (wraps tools/cost_tracker.py)
  resume <project-dir>             report completed stages + the next stage to run from checkpoints
  agent                           regenerate pipeline manifests + schemas + assistant configs

Options (plan/make):
  --pipeline, -p <id>             pipeline shape (default: animated-explainer)
  --seconds,  -s <n>              target runtime in seconds (default: 20)
`);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }

    if (command === "doctor") return runDoctor(rest);
    if (command === "status") return runStatusCommand(rest);
    if (command === "runtimes") return runRuntimesCommand(rest);
    if (command === "reel") return runReelCommand(rest);
    if (command === "capture") return runCaptureCommand(rest);
    if (command === "compose") return runComposeCommand(rest);
    if (command === "corpus") return runCorpusCommand(rest);
    if (command === "budget") return runBudgetCommand(rest);
    if (command === "resume") return runResumeCommand(rest);

    if (command === "voiceid") {
      const sub = rest[0];
      if (sub === "status") {
        const status = speakerIntelligenceStatus();
        console.log(`speaker intelligence: resemblyzer=${status.resemblyzer} speechbrain-ecapa=${status.speechbrainEcapa} pyannote=${status.pyannote}`);
        return 0;
      }
      const a = rest[1];
      const b = rest[2];
      if (sub === "search" && a && b && existsSync(b)) {
        const line = optionValue(rest, "--line");
        const corpus = JSON.parse(readFileSync(b, "utf8")) as { id: string; speaker: string; path: string; line?: string; tags?: string[] }[];
        const matches = findDialogueByVoice({ queryAudioPath: a, requestedLine: line, corpus }).slice(0, 10);
        for (const m of matches) {
          console.log(`${m.combinedScore.toFixed(3)} voice=${m.voiceScore ?? "n/a"} line=${m.lineScore.toFixed(3)} ${m.clip.speaker} :: ${m.clip.line ?? m.clip.id}`);
          console.log(`  ${m.clip.path}`);
        }
        return matches.length ? 0 : 1;
      }
      if (!voiceIdAvailable()) { console.error("voice-ID unavailable (pip install resemblyzer)."); return 1; }
      if (sub === "verify" && a && b) {
        const r = voiceVerify(a, b);
        if (!r) { console.error("voice verify failed"); return 1; }
        console.log(`similarity ${r.similarity} -> ${r.same_speaker ? "SAME speaker" : "different speakers"} (threshold ${r.threshold})`);
        return 0;
      }
      if (sub === "compare" && a && rest.length >= 6) {
        const refs: [string, string][] = [];
        for (let i = 2; i + 1 < rest.length; i += 2) refs.push([rest[i]!, rest[i + 1]!]);
        const r = voiceCompare(a, refs);
        if (!r) { console.error("voice compare failed"); return 1; }
        console.log(`closest speaker: ${r.match} (margin ${r.margin})`);
        for (const [label, score] of Object.entries(r.scores)) console.log(`  ${label}: ${score}`);
        return 0;
      }
      console.error("usage: voiceid status | voiceid verify <a.wav> <b.wav> | voiceid compare <test.wav> <labelA> <refA.wav> <labelB> <refB.wav> | voiceid search <query.wav> <corpus.json> [--line TEXT]");
      return 1;
    }

    if (command === "music") {
      const sub = rest[0] ?? "analyze";
      const audio = rest[1];
      if (!audio || !existsSync(audio)) { console.error("usage: montara music analyze <audio> | montara music score <audio> <scenes.json>"); return 1; }
      const analysis = analyzeMusic(audio);
      if (sub === "analyze") {
        const out = join(process.cwd(), "out", `${slug(audio.replace(/\.[a-z0-9]+$/i, ""))}.music-analysis.json`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(analysis, null, 2)}\n`);
        console.log(`music: ${analysis.durationSec.toFixed(2)}s mean=${analysis.loudness.meanDb ?? "?"}dB peak=${analysis.loudness.peakDb ?? "?"}dB approx=${analysis.loudness.approximateLufs ?? "?"} LUFS`);
        for (const gate of analysis.qualityGates) console.log(`  ${gate.ok ? "ok" : "warn"} ${gate.id}: ${gate.detail}`);
        console.log(out);
        return analysis.ok ? 0 : 1;
      }
      if (sub === "score") {
        const scenePath = rest[2];
        if (!scenePath || !existsSync(scenePath)) { console.error("usage: montara music score <audio> <scenes.json>"); return 1; }
        const scenes = JSON.parse(readFileSync(scenePath, "utf8")) as { id: string; startSec: number; endSec: number; role?: string; emphasis?: "low" | "medium" | "high" }[];
        const cues = planSceneMappedMusic(analysis, scenes);
        const out = join(process.cwd(), "out", `${slug(scenePath.replace(/\.json$/i, ""))}.music-cues.json`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify({ analysis, cues }, null, 2)}\n`);
        console.log(`music cues -> ${out}`);
        for (const cue of cues) console.log(`  ${cue.sceneId}: ${cue.startSec}-${cue.endSec}s gain ${cue.gainDb}dB silence ${cue.silenceBeforeSec}s`);
        return 0;
      }
      console.error("usage: montara music analyze <audio> | montara music score <audio> <scenes.json>");
      return 1;
    }

    if (command === "render3d") {
      const kind = rest[0] ?? "blender";
      const out = rest[1] || join(process.cwd(), "out", `montara-3d-${kind}.mp4`);
      if (kind === "blender") {
        if (!blenderAvailable()) { console.error("Blender not installed (download from blender.org)."); return 1; }
        const script = join(process.cwd(), "blender", "montara_intro.py");
        const res = renderBlenderScene(script, out);
        if (!res.ok) { console.error(`blender render failed: ${res.error}`); return 1; }
        console.log(`blender: ${res.frames} frames -> ${res.path}`);
        return 0;
      }
      if (kind === "three") {
        if (!threeAvailable()) { console.error("three render needs a Chrome/Edge browser + three (pnpm add -w three)."); return 1; }
        const secEi = rest.indexOf("--seconds");
        const res = renderThreeScene(out, { title: "MONTARA", seconds: secEi >= 0 ? Number(rest[secEi + 1]) : 1.5 });
        if (!res.ok) { console.error(`three render failed: ${res.error}`); return 1; }
        console.log(`three (WebGL): ${res.frames} frames -> ${res.path}`);
        return 0;
      }
      if (kind === "manim") {
        if (!manimAvailable()) { console.error("manim not installed (pip install manim)."); return 1; }
        const res = renderManimScene(out, { quality: "l" });
        if (!res.ok) { console.error(`manim render failed: ${res.error}`); return 1; }
        console.log(`manim: scene ${res.scene} -> ${res.path}`);
        return 0;
      }
      console.error(`unknown 3d renderer: ${kind} (supported: blender, three, manim)`);
      return 1;
    }

    if (command === "skills") {
      const sub = rest[0] ?? "list";
      if (sub === "find") {
        const query = rest.slice(1).join(" ");
        if (!query) { console.error('usage: montara skills find "<query>"'); return 1; }
        const hits = findSkills(query);
        if (!hits.length) { console.log(`no skills match "${query}"`); return 0; }
        for (const s of hits) console.log(`${s.id.padEnd(34)} ${s.title}${s.summary ? ` — ${s.summary.slice(0, 70)}` : ""}`);
        return 0;
      }
      const all = listSkills();
      const cat = rest[1];
      for (const s of all.filter((s) => !cat || s.category === cat)) console.log(`${s.id.padEnd(34)} ${s.title}`);
      console.log(`\n${all.length} skills. Use: montara skills find "<query>"`);
      return 0;
    }

    if (command === "brain") {
      const sub = rest[0] ?? "status";
      if (sub === "status" || sub === "models") {
        if (!ollamaInstalled()) {
          console.log(`no local LLM brain installed. Supported: ${brainCatalogue().map((b) => b.id).join(", ")}.`);
          console.log("  Install Ollama (ollama.com) or LM Studio for a zero-key local brain.");
          return 0;
        }
        const models = ollamaModelsSync();
        if (sub === "models") { for (const m of models) console.log(m); return 0; }
        console.log(`brain: ollama — ${models.length} model(s): ${models.slice(0, 8).join(", ") || "(none pulled — `ollama pull llama3.2`)"}`);
        return 0;
      }
      if (sub === "ask") {
        const mi = rest.indexOf("--model");
        const model = mi >= 0 ? rest[mi + 1] : undefined;
        const prompt = rest.slice(1)
          .filter((a, idx) => !a.startsWith("--") && !(mi >= 0 && idx + 1 === mi + 1))
          .join(" ");
        if (!prompt) { console.error('usage: montara brain ask "<prompt>" [--model NAME]'); return 1; }
        const res = ollamaCompleteSync(prompt, model);
        if (!res) { console.error("no local brain reachable (start Ollama and pull a model: `ollama pull llama3.2`)"); return 1; }
        console.log(`[ollama/${res.model}] ${res.text}`);
        return 0;
      }
      console.error("usage: montara brain <status|models|ask>");
      return 1;
    }

    if (command === "export") {
      const args = rest;
      const positional = positionalArgs(args);
      const knownFormats = new Set(["edl", "fcpxml", "otio"]);
      const oldStyle = knownFormats.has(positional[0] ?? "");
      const formatFromOption = optionValue(args, "--to");
      const format = (oldStyle ? positional[0] : formatFromOption ?? positional[1]) as EditorFormat | undefined;
      const file = oldStyle ? positional[1] : positional[0];
      const outArg = oldStyle ? positional[2] : formatFromOption ? positional[1] : positional[2];
      if (!format || !knownFormats.has(format) || !file || !existsSync(file)) {
        console.error("usage: montara export <timeline.json> --to edl|fcpxml|otio [out]");
        console.error("       montara export <edl|fcpxml|otio> <timeline.json> [out]");
        return 1;
      }
      const tl = JSON.parse(readFileSync(file, "utf8")) as Timeline;
      const issues = validateTimeline(tl);
      if (issues.length) { console.error(`invalid timeline: ${issues.join("; ")}`); return 1; }
      const { content, ext } = exportTimeline(tl, format, { title: "Montara Edit" });
      const out = outArg || join(process.cwd(), "out", `montara-edit.${ext}`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, content);
      console.log(`exported ${format.toUpperCase()} -> ${out}`);
      return 0;
    }

    if (command === "import") {
      const args = rest;
      const positional = positionalArgs(args);
      const file = positional[0];
      if (!file || !existsSync(file)) {
        console.error("usage: montara import <file.edl|.otio|.fcpxml> [out.timeline.json] [--format edl|otio|fcpxml] [--fps 30] [--width 1920] [--height 1080]");
        return 1;
      }
      const content = readFileSync(file, "utf8");
      const explicit = optionValue(args, "--format") as EditorFormat | undefined;
      const byExt = /\.edl$/i.test(file) ? "edl" : /\.otio$/i.test(file) ? "otio" : /\.fcpxml$/i.test(file) ? "fcpxml" : undefined;
      const format = explicit ?? detectEditorFormat(content) ?? byExt;
      if (!format) {
        console.error("could not detect editor format; pass --format edl|otio|fcpxml");
        return 1;
      }
      const timeline = importTimeline(content, format, {
        fps: maybeNumberOption(args, "--fps"),
        width: maybeNumberOption(args, "--width"),
        height: maybeNumberOption(args, "--height"),
      });
      const issues = validateTimeline(timeline);
      if (issues.length) { console.error(`imported IR invalid:\n  ${issues.join("\n  ")}`); return 1; }
      const out = (positional[1] && !positional[1].startsWith("--"))
        ? positional[1]
        : join(process.cwd(), "out", `${slug(file.replace(/\.[a-z0-9]+$/i, ""))}.timeline.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(timeline, null, 2)}\n`);
      const videoCount = timeline.tracks.filter((t) => t.type === "video").reduce((n, t) => n + t.clips.length, 0);
      console.log(`imported ${format.toUpperCase()} -> Timeline IR (${timeline.composition.width}x${timeline.composition.height} ${timeline.composition.fps}fps, ${timeline.composition.durationSec}s, ${videoCount} video clip(s), valid)`);
      console.log(out);
      return 0;
    }

    if (command === "voice") {
      const sub = rest[0];
      const available = new TTSSelector().availableProviders();
      if (sub === "providers") { console.log(`available voices: ${available.join(", ") || "system"}`); return 0; }
      if (sub === "plan") {
        const file = rest[1];
        if (!file || !existsSync(file)) { console.error("usage: montara voice plan <scenes.json>  # [{emotion,intensity,musicEnergy,text}]"); return 1; }
        const scenes = JSON.parse(readFileSync(file, "utf8")) as SceneEmotion[];
        const plan = directScript(scenes, available);
        plan.forEach((d, i) => console.log(`#${i + 1} ${d.emotion.padEnd(13)} ${d.provider.padEnd(11)} rate ${d.rate} gain ${d.gainDb}dB duck ${d.musicDuckDb}dB  ${d.reason}`));
        return 0;
      }
      if (sub === "direct") {
        const emotion = rest[1] ?? "neutral";
        const fi = rest.indexOf("--intensity"); const mi = rest.indexOf("--music");
        const d = directScene({ emotion, intensity: fi >= 0 ? Number(rest[fi + 1]) : 0.5, musicEnergy: mi >= 0 ? Number(rest[mi + 1]) : 0 }, available);
        console.log(`voice: ${d.provider}  rate ${d.rate}  style ${d.style}  stability ${d.stability}  gain ${d.gainDb}dB  musicDuck ${d.musicDuckDb}dB`);
        console.log(`reason: ${d.reason}`);
        return 0;
      }
      console.error("usage: montara voice <direct <emotion> [--intensity N] [--music N] | plan <scenes.json> | providers>");
      return 1;
    }

    /*
    if (false && command === "reel") {
      const input = rest[0];
      if (!input || !existsSync(input)) { console.error("usage: montara reel <input.mp4> [out] [--hook TEXT] [--cta TEXT] [--no-captions] [--model base] [--simple]"); return 1; }
      const out = (rest[1] && !rest[1].startsWith("--")) ? rest[1] : join(process.cwd(), "out", "montara-reel.mp4");
      const hookI = rest.indexOf("--hook"); const ctaI = rest.indexOf("--cta"); const modelI = rest.indexOf("--model");
      const smart = !rest.includes("--simple");
      let understanding: VideoUnderstanding | null = null;
      if (!rest.includes("--no-understand")) {
        console.log("understanding source (frames + pacing)…");
        try {
          understanding = understandVideo(input, { maxFrames: 5 });
          console.log(`  ${understanding.durationSec.toFixed(1)}s · ${understanding.sceneCount} scene(s) · tags ${understanding.tags.join(", ")}`);
        } catch (err) {
          console.log(`  understanding unavailable — continuing with fallback reel treatment (${err instanceof Error ? err.message : String(err)})`);
        }
      }
      const hook = hookI >= 0 ? rest[hookI + 1] : "";
      const cta = ctaI >= 0 ? rest[ctaI + 1] : "";

      let captions: Caption[] = [];
      if (!rest.includes("--no-captions")) {
        if (transcribeAvailable()) {
          console.log("transcribing (local faster-whisper)…");
          const t = localTranscribe(input, { model: modelI >= 0 ? rest[modelI + 1] : "base" });
          if (t) { captions = t.segments.map((s) => ({ startSec: s.start, endSec: s.end, text: s.text })); console.log(`  ${captions.length} caption cues (${t.language}, ${t.duration}s)`); }
          else console.log("  transcription failed — building reel without captions");
        } else {
          console.log("local STT unavailable (pip install faster-whisper) — building reel without captions");
        }
      }

      console.log(`composing reel (${smart ? "smart motion treatment" : "simple overlay treatment"} + -14 LUFS master)…`);
      const res = buildReel(input, out, { hook, endCard: cta, captions, lufs: -14, smart });
      if (!res.ok) { console.error(`reel failed: ${res.error}`); return 1; }
      const qa = qaPlayback(out);
      console.log(`reel -> ${out}`);
      console.log(`  ${res.captions} captions burned · ${qa.width}x${qa.height} ${qa.durationSec.toFixed(1)}s · audio ${qa.meanVolumeDb}dB/${qa.maxVolumeDb}dB peak · cuts ${qa.sceneChanges}`);
      if (qa.issues.length) console.log(`  QA notes: ${qa.issues.join("; ")}`);
      return res.ok ? 0 : 1;
    }
    */

    if (command === "master") {
      const input = rest[0];
      if (!input || !existsSync(input)) { console.error("usage: montara master <audio> [out] [--lufs -14]"); return 1; }
      const out = (rest[1] && !rest[1].startsWith("--")) ? rest[1] : join(process.cwd(), "out", "mastered.wav");
      const li = rest.indexOf("--lufs");
      const lufs = li >= 0 ? Number(rest[li + 1]) : -14;
      const res = masterAudio(input, out, { lufs });
      if (!res.ok) { console.error(`master failed: ${res.error}`); return 1; }
      console.log(`master -> ${out}  before ${res.measuredBefore?.inputI?.toFixed(1) ?? "?"} LUFS  after ${res.measuredAfter?.toFixed(1) ?? "?"} LUFS (target ${lufs})`);
      return 0;
    }

    if (command === "qa") {
      const video = rest[0];
      if (!video || !existsSync(video)) { console.error("usage: montara qa <video>"); return 1; }
      const r = qaPlayback(video);
      console.log(`qa ${r.ok ? "PASS" : "ISSUES"}: ${r.width}x${r.height} ${r.durationSec.toFixed(2)}s  audio=${r.hasAudio ? `${r.meanVolumeDb}dB mean/${r.maxVolumeDb}dB peak` : "none"}  cuts=${r.sceneChanges}`);
      for (const i of r.issues) console.log(`  - ${i}`);
      return r.ok ? 0 : 1;
    }

    if (command === "thumbnail") {
      const video = rest[0];
      if (!video || !existsSync(video)) { console.error('usage: montara thumbnail <video> [outDir] [--hooks "A|B|C"]'); return 1; }
      const outDir = rest[1] || join(process.cwd(), "out", "thumbnails");
      const dur = probeDuration(video);
      const paths = generateThumbnails(video, outDir, thumbnailConcepts(rest, Math.max(dur, 1)));
      console.log(`thumbnails -> ${paths.length} distinct concepts in ${outDir}`);
      return paths.length ? 0 : 1;
    }

    if (command === "shorts") {
      const video = rest[0];
      if (!video || !existsSync(video)) { console.error("usage: montara shorts <video> [outDir]"); return 1; }
      const outDir = rest[1] || join(process.cwd(), "out", "shorts");
      const dur = probeDuration(video);
      const seg = Math.min(20, Math.max(6, dur / 3));
      const candidateStarts = Array.from({ length: 2 }, (_, i) => Math.max(0, (dur - seg) * (i / Math.max(1, 1))));
      const cuts = candidateStarts.filter((s) => s + seg <= dur + 0.5).map((s) => ({ startSec: s, endSec: Math.min(dur, s + seg) }));
      const paths = cutShorts(video, cuts.length ? cuts : [{ startSec: 0, endSec: Math.min(dur, seg) }], outDir);
      console.log(`shorts -> ${paths.length} vertical 9:16 cut(s) in ${outDir}`);
      return paths.length ? 0 : 1;
    }

    if (command === "fx") {
      const sub = rest[0];
      const flag = (name: string): string | undefined => {
        const i = rest.indexOf(name);
        return i >= 0 ? rest[i + 1] : undefined;
      };
      const probeRes = (p: string): string => {
        const r = spawnSync(mediaBin("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", p], { encoding: "utf8" });
        return (r.stdout || "1280x720").trim();
      };
      const spec = (p: string): MediaSpec => ({ path: p });

      if (sub === "pip") {
        const base = rest[1];
        const inset = rest[2];
        if (!base || !inset) { console.error("usage: montara fx pip <base> <inset> [out.mp4] [--corner br|tl|tr|bl] [--scale 0.3] [--ellipse] [--seconds N]"); return 1; }
        const out = (rest[3] && !rest[3].startsWith("--")) ? rest[3] : join(process.cwd(), "out", "montara-pip.mp4");
        const [w, h] = probeRes(base).split("x").map(Number);
        const seconds = Number(flag("--seconds") ?? probeDuration(base) ?? 5) || 5;
        const tl = pictureInPicture({
          width: w || 1280, height: h || 720, fps: 30, durationSec: seconds,
          base: spec(base), inset: spec(inset),
          corner: (flag("--corner") as Corner) ?? "br",
          insetScale: Number(flag("--scale") ?? 0.3),
          insetMask: rest.includes("--ellipse") ? { shape: "ellipse", feather: 0.06 } : undefined,
        });
        compositeTimeline(tl, out);
        console.log(`pip -> ${out} (${probeDuration(out).toFixed(2)}s)`);
        return 0;
      }
      if (sub === "collage") {
        const out = (rest[1] && !rest[1].startsWith("--")) ? rest[1] : join(process.cwd(), "out", "montara-collage.mp4");
        const tail = rest.slice(2);
        const stop = tail.findIndex((a) => a.startsWith("--"));
        const cells = stop >= 0 ? tail.slice(0, stop) : tail; // positional clips, before any --flag
        if (cells.length < 2) { console.error("usage: montara fx collage <out.mp4> <clip1> <clip2> [clip3 ...] [--cols N] [--seconds N]"); return 1; }
        const seconds = Number(flag("--seconds") ?? probeDuration(cells[0]!) ?? 5) || 5;
        const tl = collage({
          width: 1280, height: 720, fps: 30, durationSec: seconds,
          cells: cells.map(spec), cols: flag("--cols") ? Number(flag("--cols")) : undefined,
        });
        compositeTimeline(tl, out);
        console.log(`collage -> ${out} (${probeDuration(out).toFixed(2)}s, ${cells.length} cells)`);
        return 0;
      }
      if (sub === "composite") {
        const file = rest[1];
        if (!file || !existsSync(file)) { console.error("usage: montara fx composite <timeline.json> [out.mp4]"); return 1; }
        const tl = JSON.parse(readFileSync(file, "utf8")) as Timeline;
        const out = rest[2] || join(process.cwd(), "out", "montara-composite.mp4");
        compositeTimeline(tl, out);
        console.log(`composite -> ${out} (${probeDuration(out).toFixed(2)}s)`);
        return 0;
      }
      console.error("usage: montara fx <pip|collage|composite> ...");
      return 1;
    }

    if (command === "engine") {
      const sub = rest[0] ?? "info";
      if (sub === "verify" || sub === "smoke") {
        const v = engineVerify();
        if (!v) { console.error("engine bridge unavailable (Python 3 required)"); return 1; }
        console.log(`engine smoke: AST-parsed ${v.parsed} module(s), ${v.errors} error(s)`);
        for (const b of v.bad) console.log(`  ${b.file}:${b.line} ${b.msg}`);
        return v.ok ? 0 : 1;
      }
      if (sub === "timeline") {
        const name = rest[1];
        if (!name) {
          console.error(`engine timeline <name> — available: ${engineCompositionNames().join(", ")}`);
          return 1;
        }
        const comp = engineComposition(name);
        if (!comp) { console.error(`engine composition not found: ${name}`); return 1; }
        const timeline = engineCompositionToTimeline(comp);
        const issues = validateTimeline(timeline);
        if (issues.length) { console.error(`bridged IR invalid:\n  ${issues.join("\n  ")}`); return 1; }
        const out = join(process.cwd(), "out", `${slug(name)}.timeline.json`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, `${JSON.stringify(timeline, null, 2)}\n`);
        console.log(`${comp.cuts.length} cuts -> Timeline IR (${timeline.composition.durationSec}s, ${timeline.tracks.length} tracks, valid)`);
        console.log(out);
        return 0;
      }
      if (sub === "compliance") {
        const c = engineCompliance();
        if (!c) { console.error("engine bridge unavailable (Python 3 required)"); return 1; }
        console.log(`compliance: scanned ${c.scanned} files — ${c.legacy_tokens.length} legacy token(s), ${c.hardcoded_secrets.length} hardcoded secret(s)`);
        for (const f of c.legacy_tokens) console.log(`  legacy: ${f}`);
        for (const f of c.hardcoded_secrets) console.log(`  secret: ${f}`);
        return c.ok ? 0 : 1;
      }
      if (sub === "check") {
        const sc = engineSelfcheck();
        if (!sc) { console.error("engine bridge unavailable (Python 3 required)"); return 1; }
        console.log(`engine self-check: ${sc.passed}/${sc.total} passed`);
        for (const c of sc.checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name} — ${c.detail}`);
        return sc.ok ? 0 : 1;
      }
      if (sub === "providers") {
        const p = engineProviders();
        if (!p) { console.error("engine bridge unavailable (Python 3 required)"); return 1; }
        console.log(`${p.total} engine providers · ${p.local} local (no key) · ${p.configured} configured`);
        for (const x of p.providers) {
          const status = x.local ? "local" : x.configured ? "configured" : `needs ${x.auth_env}`;
          console.log(`  ${x.name.padEnd(26)} ${x.capability.padEnd(18)} ${status}`);
        }
        return 0;
      }
      if (sub === "render") {
        const name = rest[1];
        if (!name) { console.error(`engine render <name> [out] [--engine remotion] — available: ${engineCompositionNames().join(", ")}`); return 1; }
        const preferEngine = rest.includes("--engine") && rest[rest.indexOf("--engine") + 1] === "remotion";
        const out = rest[2] && !rest[2].startsWith("--") ? rest[2] : join(process.cwd(), "out", `${slug(name)}.mp4`);
        const res = renderBridged(name, out, { preferEngine });
        if (!res.ok) { console.error(`render failed: ${res.error}`); return 1; }
        console.log(`rendered via ${res.engine}${res.fellBack ? " (fell back from engine composer)" : ""}: ${res.path}`);
        return 0;
      }
      const r = engineReady();
      if (r.ready && r.info) {
        console.log(`Python engine ready — ${r.info.python_version} @ ${r.info.engine_root}`);
        console.log(`  ${r.info.tools} tools · ${r.info.lib} lib · ${r.info.skills} skills · ${r.info.schemas} schemas`);
        console.log(`  pipelines: ${r.info.pipelines.join(", ")}`);
        return 0;
      }
      console.error(`Python engine not ready: ${r.reasons.join("; ")}`);
      return 1;
    }

    if (command === "pipelines") {
      for (const p of listPipelines()) console.log(`${p.id.padEnd(22)} ${p.blurb}`);
      return 0;
    }

    if (command === "tools") {
      for (const tool of listProviderTools()) console.log(`${tool.id.padEnd(28)} ${tool.category.padEnd(8)} ${tool.description}`);
      return 0;
    }

    if (command === "providers") {
      const sub = rest[0] ?? "video";
      if (sub === "audit" || sub === "fixtures") {
        const out = optionValue(rest, "--out") ?? join(process.cwd(), "out", "provider-audit-fixtures.json");
        const report = rest.includes("--dry") ? sanitizeProviderAuditReport(buildProviderAuditReport()) : writeProviderAuditReport(out);
        if (rest.includes("--json")) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(`provider audit: ${report.total - report.invalid}/${report.total} fixture request(s) valid`);
          if (!rest.includes("--dry")) console.log(out);
          for (const f of report.fixtures) {
            const status = f.issues.length ? `issues: ${f.issues.join("; ")}` : "ok";
            console.log(`  ${f.providerId.padEnd(22)} ${f.category.padEnd(5)} ${status}`);
          }
        }
        return report.invalid === 0 ? 0 : 1;
      }
      if (sub === "smoke") {
        const positional = positionalArgs(rest).slice(1);
        const providerId = positional[0];
        if (!providerId) {
          console.error("usage: montara providers smoke <provider-id> [--category video|image|tts|music] [--live] [--out path] [--json]");
          return 1;
        }
        const category = optionValue(rest, "--category") as MediaCategory | undefined;
        const result = await runProviderSmoke({
          providerId,
          category,
          live: rest.includes("--live"),
          outPath: optionValue(rest, "--out"),
        });
        if (rest.includes("--json")) {
          console.log(JSON.stringify({ ...result, request: result.redactedRequest }, null, 2));
        } else {
          console.log(`${result.providerId}: ${result.mode} ${result.ok ? "ok" : "blocked"}`);
          console.log(`${result.redactedRequest.method} ${result.redactedRequest.url}`);
          if (result.nextStep) console.log(result.nextStep);
          if (result.error) console.error(result.error);
        }
        return result.ok ? 0 : 1;
      }
      const category = sub;
      const providers =
        category === "image" ? listImageProviders(true)
        : category === "tts" ? listTtsProviders(true)
        : category === "music" ? listMusicProviders(true)
        : listVideoProviders(true);
      for (const p of providers) {
        const status = providerAvailable(p) ? "available" : `needs ${p.authEnv ?? "key"}`;
        console.log(`${p.id.padEnd(24)} ${p.tier.padEnd(13)} ${status.padEnd(22)} ${p.name}`);
      }
      return 0;
    }

    if (command === "plan") {
      const { pipelineId, idea, targetSeconds } = parseMakeArgs(rest);
      const plan = planVideo(pipelineId, idea, targetSeconds ? { targetSeconds } : {});
      const out = join(process.cwd(), "out", `${slug(idea || pipelineId)}.scene-plan.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
      console.log(out);
      return 0;
    }

    if (command === "make") {
      const { pipelineId, idea, targetSeconds } = parseMakeArgs(rest);
      const plan = planVideo(pipelineId, idea, targetSeconds ? { targetSeconds } : {});
      const composed = composeScenePlan(plan);
      const promised = composed.timeline.composition.durationSec;
      const gate = preComposeGate(composed.timeline, { targetDurationSec: promised });
      if (!gate.ok) {
        console.error(`blocked by pre-compose gate:\n  ${gate.blockers.join("\n  ")}`);
        return 1;
      }
      for (const w of gate.warnings) console.error(`  warn: ${w}`);
      const base = slug(idea || pipelineId);
      const ir = join(process.cwd(), "out", `${base}.timeline.json`);
      const mp4 = join(process.cwd(), "out", `${base}.mp4`);
      const reportPath = join(process.cwd(), "out", `${base}.self-review.json`);
      mkdirSync(dirname(ir), { recursive: true });
      writeFileSync(ir, `${JSON.stringify(composed.timeline, null, 2)}\n`);
      renderComposedScenePlan(plan, mp4);
      const review = postRenderSelfReview(mp4, { timeline: composed.timeline, targetDurationSec: promised });
      writeSelfReview(review, reportPath);
      console.log(mp4);
      console.log(reportPath);
      return existsSync(mp4) && review.ok ? 0 : 1;
    }

    if (command === "engines") {
      for (const e of listEngines()) {
        const status = engineReallyAvailable(e.id) ? (e.id === "ffmpeg" ? "native" : "native ✓ installed") : "degrades to ffmpeg";
        console.log(`${e.id.padEnd(14)} ${status.padEnd(20)} ${e.license.padEnd(16)} ${e.role}`);
      }
      return 0;
    }

    if (command === "recommend") {
      const sceneType = rest[0];
      if (!sceneType) { console.error("usage: montara recommend <sceneType>  (e.g. 3d, title-3d, math, kinetic-typography, explainer, assembly)"); return 1; }
      const out = (rest[1] && !rest[1].startsWith("--")) ? rest[1] : "";
      const rec = recommendEngine(sceneType);
      console.log(`recommend '${sceneType}': use ${rec.engine}${rec.native ? " (native)" : ""} — ${rec.reason}`);
      if (out) {
        const r = autoRenderScene({ sceneType, outPath: out, title: rest.includes("--title") ? rest[rest.indexOf("--title") + 1] : "MONTARA" });
        if (!r.ok) { console.error(`auto-render failed: ${r.error}`); return 1; }
        console.log(`auto-rendered via ${r.engine}${r.native ? " (native)" : ""}: ${r.path}`);
      }
      return 0;
    }

    if (command === "styles") {
      for (const s of listStyles()) console.log(`${s.id.padEnd(20)} ${s.typography.fontFamily.padEnd(16)} ${s.name}`);
      return 0;
    }

    if (command === "profiles") {
      for (const p of listOutputProfiles()) console.log(`${p.id.padEnd(12)} ${`${p.width}x${p.height}`.padEnd(11)} ${p.aspect.padEnd(6)} ${p.name}`);
      return 0;
    }

    if (command === "research") {
      const idea = rest.join(" ").trim() || "untitled topic";
      const bundle = runResearch(idea);
      const out = join(process.cwd(), "out", `${slug(idea)}.research.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
      console.log(`${bundle.queries.length} queries · ${bundle.findings.length} findings · ${bundle.online ? "online" : "offline brief"}`);
      for (const angle of bundle.angles) console.log(`  angle: ${angle}`);
      console.log(out);
      return 0;
    }

    if (command === "analyze") {
      const input = rest[0];
      if (!input) throw new Error("analyze requires a video path");
      const a = analyzeReferenceVideo(input, {});
      console.log(`${a.durationSec.toFixed(2)}s · ${a.width}x${a.height} · ${a.sceneCount} scene(s) · ${a.cutsPerMinute} cuts/min`);
      console.log(`tags: ${a.understanding.tags.join(", ")}`);
      for (const c of a.concepts) console.log(`  concept ${c.id}: ${c.angle}`);
      console.log(`est. cost: $${a.costEstimateUsd}`);
      const out = join(process.cwd(), "out", `${slug(input.replace(/\.[a-z0-9]+$/i, ""))}.analysis.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(a, null, 2)}\n`);
      console.log(out);
      return 0;
    }

    if (command === "agent") {
      const root = process.cwd();
      const manifests = writePipelineManifests(join(root, "pipelines"));
      const schemas = writeSchemas(join(root, "schemas"));
      const configs = writeAssistantConfigs(join(root, "out", "agent"));
      console.log(`pipelines:  ${manifests.length} YAML manifests -> pipelines/`);
      console.log(`schemas:    ${schemas.length} JSON schemas -> schemas/`);
      console.log(`assistants: ${configs.length} configs -> out/agent/`);
      console.log(`entry:      ${SKILLS_ENTRY}`);
      return 0;
    }

    if (command === "review") {
      const input = rest[0];
      if (!input) throw new Error("review requires an MP4 path");
      const report = postRenderSelfReview(input, {});
      for (const c of report.checks) console.log(`  ${c.status.padEnd(4)} ${c.name} — ${c.detail}`);
      const out = join(process.cwd(), "out", `${slug(input.replace(/\.[a-z0-9]+$/i, ""))}.self-review.json`);
      writeSelfReview(report, out);
      console.log(out);
      return report.ok ? 0 : 1;
    }

    if (command === "render") {
      const input = rest[0];
      if (!input) throw new Error("render requires an input JSON path");
      const out = rest[1] || join(process.cwd(), "out", `${slug(input.replace(/\.json$/i, ""))}.mp4`);
      const result = renderFile(input, out);
      console.log(result);
      return existsSync(result) ? 0 : 1;
    }

    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = await main();
