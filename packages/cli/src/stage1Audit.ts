import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listPipelines } from "../../ai/src/index";
import { listSkills, findSkills } from "../../agent/src/index";
import {
  engineCompositionNames,
  engineCompliance,
  engineProviders,
  engineReady,
  engineRoot,
  engineSelfcheck,
  engineVerify,
} from "../../engine/src/index";
import {
  buildProviderAuditReport,
  cloudProviders,
  ENHANCEMENT_TOOLS,
  IMAGE_PROVIDERS,
  listProviderTools,
  LOCAL_IMAGE_FALLBACK,
  LOCAL_MUSIC_FALLBACK,
  LOCAL_TTS_FALLBACK,
  LOCAL_VIDEO_FALLBACK,
  MUSIC_PROVIDERS,
  TTS_PROVIDERS,
  VIDEO_PROVIDERS,
} from "../../providers/src/index";
import { engineReallyAvailable, getEngine, listEngines, preferredEngine } from "../../render-engines/src/index";
import { listOutputProfiles, listStyles } from "../../style/src/index";

export type Stage1AuditStatus = "complete" | "partial";
export type Stage1SectionId = "1A" | "1B" | "1C-K" | "1D";

export interface Stage1AuditCheck {
  id: string;
  label: string;
  ok: boolean;
  evidence: string[];
}

export interface Stage1AuditSection {
  id: Stage1SectionId;
  title: string;
  status: Stage1AuditStatus;
  checks: Stage1AuditCheck[];
  notes: string[];
}

export interface Stage1AuditReport {
  generatedAt: string;
  stage: "1";
  title: string;
  status: Stage1AuditStatus;
  summary: {
    sectionsComplete: number;
    sectionsTotal: number;
    checksPassed: number;
    checksTotal: number;
  };
  sections: Stage1AuditSection[];
  caveatsHandedOff: string[];
}

function check(id: string, label: string, ok: boolean, evidence: string[]): Stage1AuditCheck {
  return { id, label, ok, evidence };
}

function section(id: Stage1SectionId, title: string, checks: Stage1AuditCheck[], notes: string[] = []): Stage1AuditSection {
  return {
    id,
    title,
    status: checks.every((item) => item.ok) ? "complete" : "partial",
    checks,
    notes,
  };
}

function yamlCount(dir: string): number {
  try {
    return readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name)).length;
  } catch {
    return 0;
  }
}

export function buildStage1AuditReport(start = process.cwd()): Stage1AuditReport {
  const root = engineRoot(start);
  const engine = engineReady(root);
  const verify = engineVerify(root);
  const providers = engineProviders(root);
  const selfcheck = engineSelfcheck(root);
  const compliance = engineCompliance(root);
  const compositions = engineCompositionNames(root);

  const pipelineDefsDir = join(root, "pipeline_defs");
  const pipelineDefCount = yamlCount(pipelineDefsDir);
  const aiPipelines = listPipelines();
  const requiredPipelineDefs = [
    "documentary-montage.yaml",
    "screen-demo.yaml",
    "kinetic-typography.yaml",
    "character-animation.yaml",
  ];

  const providerAudit = buildProviderAuditReport();
  const providerTools = listProviderTools();
  const toolCategories = new Set(providerTools.map((tool) => tool.category));
  const localFallbacks = [LOCAL_VIDEO_FALLBACK, LOCAL_IMAGE_FALLBACK, LOCAL_TTS_FALLBACK, LOCAL_MUSIC_FALLBACK];
  const skills = listSkills();

  const engines = listEngines();
  const engineIds = new Set(engines.map((engine) => engine.id));
  const engineMaturitiesOk = engines.every((engine) => Boolean(engine.license) && Boolean(engine.role) && Boolean(engine.maturity));

  const sections = [
    section("1A", "Python engine and bridge", [
      check("1A.ready", "Root Python engine is ready", engine.ready && Boolean(engine.info), [
        engine.info ? `Python ${engine.info.python_version}` : engine.reasons.join("; ") || "engine unavailable",
        engine.info ? `${engine.info.tools} tools, ${engine.info.lib} lib modules` : "no engine info",
      ]),
      check("1A.verify", "Bridge integrity smoke passes", Boolean(verify?.ok), [
        verify ? `${verify.parsed} modules parsed, ${verify.errors} errors` : "verify unavailable",
      ]),
      check("1A.providers", "Bridge discovers provider tools without secrets", Boolean(providers && providers.total >= 80 && providers.local >= 1), [
        providers ? `${providers.total} providers, ${providers.local} local, ${providers.configured} configured` : "provider report unavailable",
      ]),
      check("1A.compositions", "Checked-in engine compositions bridge into Timeline IR", compositions.length >= 1, [
        `${compositions.length} composition(s): ${compositions.slice(0, 5).join(", ") || "none"}`,
      ]),
      check("1A.selfcheck", "Engine self-check battery is green", Boolean(selfcheck?.ok), [
        selfcheck ? `${selfcheck.passed}/${selfcheck.total} checks passed` : "self-check unavailable",
      ]),
      check("1A.compliance", "Bridge compliance scan is green", Boolean(compliance?.ok), [
        compliance ? `${compliance.scanned} files scanned` : "compliance unavailable",
      ]),
    ], ["CLI bridge commands plus this audit make 1A deliberate rather than implicit."]),

    section("1B", "Pipeline manifests and offline validate paths", [
      check("1B.ai-pipelines", "Core AI planner exposes the 12 production pipelines", aiPipelines.length === 12, [
        `${aiPipelines.length} planner pipeline(s)`,
      ]),
      check("1B.pipeline-defs", "Pipeline definitions include the Montara extras", pipelineDefCount >= 14, [
        `${pipelineDefCount} pipeline_defs YAML file(s)`,
      ]),
      check("1B.required-defs", "Documentary, screen-demo, kinetic, and character paths are present", requiredPipelineDefs.every((name) => existsSync(join(pipelineDefsDir, name))), [
        requiredPipelineDefs.join(", "),
      ]),
    ], ["Stage 1B's remaining MP4 proof lives in validate, not in docs prose."]),

    section("1C-K", "Providers, tools, governance, styles, and agent layer", [
      check("1C.fixtures", "Cloud provider fixtures are valid and redacted", providerAudit.invalid === 0 && providerAudit.total === cloudProviders().length && providerAudit.total >= 18, [
        `${providerAudit.total} cloud fixtures, ${providerAudit.invalid} invalid`,
      ]),
      check("1C.provider-counts", "Video, image, TTS, and music provider families match the parity surface", VIDEO_PROVIDERS.length === 14 && IMAGE_PROVIDERS.length === 10 && TTS_PROVIDERS.length === 4 && MUSIC_PROVIDERS.length === 3, [
        `${VIDEO_PROVIDERS.length} video, ${IMAGE_PROVIDERS.length} image, ${TTS_PROVIDERS.length} TTS, ${MUSIC_PROVIDERS.length} music`,
      ]),
      check("1C.local-fallbacks", "Local-free fallbacks cover video, image, voice, and music", localFallbacks.every((provider) => provider.tier === "local-free"), [
        localFallbacks.map((provider) => provider.id).join(", "),
      ]),
      check("1C.tools", "Offline provider tools cover media, post, and analysis categories", providerTools.length >= 9 && ["video", "image", "tts", "music", "post", "analysis"].every((category) => toolCategories.has(category as never)), [
        `${providerTools.length} local tool(s), ${toolCategories.size} category families`,
      ]),
      check("1F.enhancement", "Post/enhancement catalogue is present and runtime-gated", ENHANCEMENT_TOOLS.length >= 10 && ENHANCEMENT_TOOLS.every((tool) => Boolean(tool.runtimeEnv)), [
        `${ENHANCEMENT_TOOLS.length} enhancement tool(s)`,
      ]),
      check("1J.styles", "Styles and output profiles are registered", listStyles().length >= 3 && listOutputProfiles().length >= 6, [
        `${listStyles().length} styles, ${listOutputProfiles().length} output profiles`,
      ]),
      check("1K.skills", "Agent skill layer can find provider and native-render guidance", skills.length > 20 && findSkills("provider audit live byok redacted fixture").some((hit) => hit.id === "core/provider-audit.md") && findSkills("native render validation remotion three blender").some((hit) => hit.id === "core/native-render-validation.md"), [
        `${skills.length} indexed skill(s)`,
      ]),
    ], ["Live BYOK confirmations remain Stage 4 work; Stage 1 proves request shape, fallbacks, and governance."]),

    section("1D", "Composition engine registry honesty", [
      check("1D.count", "All nine composition/capture engines are registered", engines.length === 9, [
        engines.map((engine) => engine.id).join(", "),
      ]),
      check("1D.ids", "Runtime-gated and planned engines are visible", ["ffmpeg", "remotion", "revideo", "motion-canvas", "three", "manim", "blender", "spline", "playwright"].every((id) => engineIds.has(id as never)), [
        "ffmpeg, remotion, revideo, motion-canvas, three, manim, blender, spline, playwright",
      ]),
      check("1D.maturity", "Engine maturity labels are explicit", engineMaturitiesOk && getEngine("revideo")?.maturity === "runtime-gated" && getEngine("motion-canvas")?.maturity === "runtime-gated" && getEngine("spline")?.maturity === "planned", [
        engines.map((engine) => `${engine.id}:${engine.maturity}`).join(", "),
      ]),
      check("1D.ffmpeg", "FFmpeg floor is always available for degraded output", engineReallyAvailable("ffmpeg") === true, [
        "ffmpeg availability probe returned true",
      ]),
      check("1D.routing", "Scene-type recommendations route to the intended native targets", preferredEngine("kinetic-typography").id === "motion-canvas" && preferredEngine("explainer-mit").id === "revideo" && preferredEngine("3d").id === "three", [
        `kinetic=${preferredEngine("kinetic-typography").id}, mit=${preferredEngine("explainer-mit").id}, 3d=${preferredEngine("3d").id}`,
      ]),
    ], ["Native Revideo and Motion Canvas proof moves to Stage 2; Stage 1 only claims honest routing and fallback visibility."]),
  ];

  const checksTotal = sections.reduce((sum, item) => sum + item.checks.length, 0);
  const checksPassed = sections.reduce((sum, item) => sum + item.checks.filter((check) => check.ok).length, 0);
  const sectionsComplete = sections.filter((item) => item.status === "complete").length;
  const status: Stage1AuditStatus = sectionsComplete === sections.length ? "complete" : "partial";

  return {
    generatedAt: new Date().toISOString(),
    stage: "1",
    title: "Source-engine parity",
    status,
    summary: {
      sectionsComplete,
      sectionsTotal: sections.length,
      checksPassed,
      checksTotal,
    },
    sections,
    caveatsHandedOff: [
      "Stage 2 owns the remaining native Revideo/Motion Canvas installed-runtime proofs beyond honest registry routing.",
      "Stage 3 now validate-covers local brain fallback, reel/documentary quality gates, and project workspaces; optional SpeechBrain and BLIP/cached-weight vision remain runtime-gated hardening.",
      "Stage 4 owns live BYOK provider confirmations; Stage 1 only proves redacted fixtures and dry-run/live smoke plumbing.",
    ],
  };
}

export function printStage1AuditReport(report: Stage1AuditReport): void {
  console.log(`Stage 1 parity audit: ${report.status}`);
  console.log(`${report.summary.sectionsComplete}/${report.summary.sectionsTotal} sections complete, ${report.summary.checksPassed}/${report.summary.checksTotal} checks passed`);
  for (const section of report.sections) {
    console.log(`\n${section.id} ${section.status} - ${section.title}`);
    for (const item of section.checks) {
      console.log(`  ${item.ok ? "ok  " : "fail"} ${item.label}`);
      for (const evidence of item.evidence.slice(0, 2)) console.log(`      ${evidence}`);
    }
    for (const note of section.notes) console.log(`  note: ${note}`);
  }
  console.log("\nHand-offs:");
  for (const caveat of report.caveatsHandedOff) console.log(`  - ${caveat}`);
}
