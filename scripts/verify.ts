// Montara verify harness. Contract tests for core + render-ffmpeg, including real MP4 renders.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_PROFILES,
  DEFAULT_CONFIG,
  createConfig,
  ffmpegOutputArgs,
  getProfile,
  getProfilesForPlatform,
  parseConfigText,
  resolveConfigPath,
  scenePlanToTimeline,
  timelineDuration,
  totalDuration,
  round3,
  validateTimeline,
  splitClip,
  trimClip,
  moveClip,
  removeClip,
  recolorClip,
  setClipText,
  findClip,
  setTransform,
  setMask,
  addEffect,
  setCrop,
  setZ,
  isMediaClip,
  pictureInPicture as pipTimeline,
  collage as collageTimeline,
  scenePlanArtifactToTimeline,
  timelineToScenePlanArtifact,
  editDecisionsToTimeline,
  timelineToEditDecisions,
  type EditDecisionsArtifact,
  type ScenePlanArtifact,
  type ScenePlan,
} from "../packages/core/src/index";
import { directScene, directScript, resolveEmotion, planReelTreatment, createReelArtifacts } from "../packages/quality/src/index";
import { exportTimeline, timelineToEDL, timelineToOTIO, timelineToFCPXML, framesToTimecode, importTimeline, edlToTimeline, otioToTimeline, fcpxmlToTimeline, detectEditorFormat, videoClips } from "../packages/bridge/src/index";
import { brainCatalogue, ollamaInstalled } from "../packages/llm/src/index";
import { renderScenePlan, renderTimeline, probeDuration } from "../packages/render-ffmpeg/src/index";
import { remotionDefaultEnabled, timelineToRemotionProps } from "../packages/render-remotion/src/index";
import { listPipelines, planVideo } from "../packages/ai/src/index";
import {
  listProviderTools,
  VIDEO_PROVIDERS,
  listVideoProviders,
  providerAvailable,
  buildVideoRequest,
  planVideoGeneration,
  runVideoGeneration,
  getVideoProvider,
  IMAGE_PROVIDERS,
  getImageProvider,
  buildImageRequest,
  executeProviderRequest,
  planImageGeneration,
  redactProviderRequest,
  runImageGeneration,
  TTS_PROVIDERS,
  MUSIC_PROVIDERS,
  LOCAL_TTS_FALLBACK,
  LOCAL_MUSIC_FALLBACK,
  getTtsProvider,
  buildTtsRequest,
  buildProviderAuditFixtures,
  buildProviderAuditReport,
  writeProviderAuditReport,
  runProviderSmoke,
  cloudProviders,
  planSpeechGeneration,
  runSpeechGeneration,
  runMusicGeneration,
  mixAudioTracks,
  enhanceAudio,
  colorGrade,
  crossfadeStitch,
  pictureInPicture,
  upscaleVideo,
  ENHANCEMENT_TOOLS,
  getEnhancementTool,
  enhancementAvailable,
  planMattingPipeline,
} from "../packages/providers/src/index";
import {
  DecisionTrail,
  SELECTION_WEIGHTS,
  selectProviderTool,
  selectMediaProvider,
  slideshowRisk,
  preComposeGate,
  BudgetLedger,
  DeliveryPromise,
  PromiseType,
  PROMISE_RULES,
  classifyFromBrief,
  getEnv,
  loadEnv,
  loadConfig,
  parseEnvText,
  requireEnv,
  ProviderScore,
  ProductionPathScore,
  scoreProvider,
  rankProviders,
  scoreSlideshowRisk,
  checkSceneVariation,
  stepDuration,
  trace,
  assertAlignment,
  detectMediaType,
  parseFps,
  sampleTimestamps,
  reviewSourceMedia,
  type ScorableTool,
  type Scene,
} from "../packages/quality/src/index";
import {
  planResearchQueries,
  runResearch,
  indexFootage,
  retrieveFootage,
  modelInfo,
  embedTexts,
  poolFrames,
  Corpus,
  createClipRecord,
  normalizedVector,
  EMBED_DIM,
} from "../packages/research/src/index";
import { getPipeline, PIPELINE_DEFS } from "../packages/ai/src/index";
import { detectScenes, sampleKeyFrames, transcribe, understandVideo, analyzeReferenceVideo } from "../packages/understand/src/index";
import { listEngines, getEngine, engineAvailable, preferredEngine, renderWithEngine, recommendEngine, engineReallyAvailable, availableEngines } from "../packages/render-engines/src/index";
import { threeAvailable } from "../packages/render-three/src/index";
import {
  STYLE_PLAYBOOKS,
  OUTPUT_PROFILES,
  applyStyle,
  applyOutputProfile,
  getOutputProfile,
  generatePlaybook,
  buildShotPrompt,
  buildBatchPrompts,
  styleBridge,
  FALLBACK_CSS_VARS,
} from "../packages/style/src/index";
import {
  buildDefaultRegistry,
  ElevenLabsTTS,
  OpenAITTS,
  GoogleTTS,
  PiperTTS,
  DoubaoTTS,
  SystemTTS,
  TTSSelector,
} from "../packages/tools/src/index";
import { engineInfo, engineVerify, engineComposition, engineCompositionToTimeline, timelineToEngineComposition, engineProviders, engineSelfcheck, engineCompliance } from "../packages/engine/src/index";
import { blenderAvailable, blenderBin } from "../packages/render-blender/src/index";
import { analyzeMusic, findDialogueByVoice, planSceneMappedMusic, speakerIntelligenceStatus, voiceIdAvailable } from "../packages/hear/src/index";
import { installRuntime, launchRuntime, listRuntimes, managedRuntimePlan, runtimeEnvHints, runtimeInstallPlan, runtimeStatusReport, writeRuntimeEnv } from "../packages/runtimes/src/index";
import {
  renderPipelineManifest,
  validateJson,
  scenePlanSchema,
  timelineSchema,
  pipelineSchema,
  createCheckpoint,
  advanceCheckpoint,
  nextStage,
  isComplete,
  saveCheckpoint,
  loadCheckpoint,
  ALL_KNOWN_STAGES,
  CANONICAL_STAGE_ARTIFACTS,
  STAGES,
  checkExtensionPermitted,
  getCompletedStages,
  getLatestCheckpoint,
  getNextStage,
  getPermittedExtensions,
  getReferenceInputConfig,
  getRequiredTools,
  getStageOrder,
  getStageReviewFocus,
  getStageSkill,
  getStageSubStages,
  getPipelineStages,
  pipelineSupportsReferenceInput,
  readCheckpoint,
  validateCheckpoint,
  writeCheckpoint,
  renderAssistantConfig,
  ASSISTANT_TARGETS,
  SKILLS_ENTRY,
  listSkills,
  findSkills,
} from "../packages/agent/src/index";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  if (cond) {
    pass++;
    console.log(`  ok ${name}`);
  } else {
    fail++;
    console.log(`  fail ${name}${extra ? "  " + extra : ""}`);
  }
};

console.log("== Montara verify ==\n");

console.log("== core ==");
const plan: ScenePlan = {
  width: 640,
  height: 360,
  fps: 30,
  scenes: [
    { id: "s1", title: "MONTARA", durationSec: 1.5, background: "0a0a0a" },
    { id: "s2", title: "scene plan renders", durationSec: 1.5, background: "1a1a1a" },
  ],
};
ok("totalDuration sums scenes", Math.abs(totalDuration(plan) - 3.0) < 1e-6, `got ${totalDuration(plan)}`);
ok("round3 rounds to ms", round3(1.23456) === 1.235, `got ${round3(1.23456)}`);
const timeline = scenePlanToTimeline(plan);
ok("scene plan compiles to Timeline IR", timeline.tracks.length === 2 && timeline.composition.durationSec === 3);
ok("Timeline IR validates", validateTimeline(timeline).length === 0, validateTimeline(timeline).join("; "));
ok("timelineDuration reads clip ends", timelineDuration(timeline) === 3, `got ${timelineDuration(timeline)}`);

const upstreamScenePlan: ScenePlanArtifact = {
  version: "1.0",
  style_playbook: "explainer-data",
  scenes: [
    {
      id: "system-loop",
      type: "diagram",
      description: "Show the quest progression loop",
      start_seconds: 0,
      end_seconds: 2,
      information_role: "Quest -> skill -> gear -> choice",
    },
    {
      id: "ui-example",
      type: "screen_recording",
      description: "Mock the player-facing rule UI",
      start_seconds: 2,
      end_seconds: 4.5,
      shot_intent: "Make the abstract design rule inspectable",
    },
  ],
};
const bridgedSceneTimeline = scenePlanArtifactToTimeline(upstreamScenePlan, { width: 1280, height: 720, fps: 24 });
const sceneRoundTrip = timelineToScenePlanArtifact(bridgedSceneTimeline);
ok("scene_plan artifacts bridge into valid Timeline IR",
  validateTimeline(bridgedSceneTimeline).length === 0 &&
  bridgedSceneTimeline.composition.durationSec === 4.5 &&
  sceneRoundTrip.scenes.length === 2);

const upstreamEditDecisions: EditDecisionsArtifact = {
  version: "1.0",
  render_runtime: "hyperframes",
  renderer_family: "explainer-data",
  cuts: [
    { id: "a", source: "solid:101820", in_seconds: 0, out_seconds: 1.25, title: "A rule appears" },
    { id: "b", source: "solid:214f4b", in_seconds: 0, out_seconds: 1.75, title: "The system reacts" },
  ],
};
const bridgedEditTimeline = editDecisionsToTimeline(upstreamEditDecisions, { width: 1080, height: 1920 });
const editRoundTrip = timelineToEditDecisions(bridgedEditTimeline, { renderRuntime: "ffmpeg", rendererFamily: "presenter" });
ok("edit_decisions artifacts bridge into Timeline IR and back",
  validateTimeline(bridgedEditTimeline).length === 0 &&
  bridgedEditTimeline.composition.durationSec === 3 &&
  editRoundTrip.render_runtime === "ffmpeg" &&
  editRoundTrip.cuts.length === 2);

console.log("\n== foundation config + delivery (P1) ==");
const defaults = createConfig();
ok("config defaults match the source contract", JSON.stringify(defaults) === JSON.stringify(DEFAULT_CONFIG));

const yamlConfig = parseConfigText([
  "llm:",
  "  provider: local",
  "  model: llama",
  "  temperature: 0.2",
  "  max_tokens: 1024",
  "budget:",
  "  mode: cap",
  "  total_usd: 2.5",
  "paths:",
  "  output_dir: out",
].join("\n"));
ok("config parser overlays nested YAML while preserving defaults",
  yamlConfig.llm.provider === "local" &&
  yamlConfig.llm.model === "llama" &&
  yamlConfig.llm.max_tokens === 1024 &&
  yamlConfig.budget.mode === "cap" &&
  yamlConfig.output.default_codec === "libx264" &&
  yamlConfig.paths.output_dir === "out");
ok("config path resolver joins project root and named path",
  resolveConfigPath(defaults, "skills_dir", join(process.cwd(), "verify-root")).replace(/\\/g, "/").endsWith("/verify-root/skills"));
const configDir = join(process.cwd(), "out", "verify-config");
mkdirSync(configDir, { recursive: true });
writeFileSync(join(configDir, "config.yaml"), "output:\n  default_fps: 24\npaths:\n  output_dir: rendered\n");
ok("config file loader reads config.yaml and falls back when missing",
  loadConfig(undefined, configDir).output.default_fps === 24 &&
  loadConfig(undefined, configDir).paths.output_dir === "rendered" &&
  loadConfig(join(configDir, "missing.yaml")).output.default_fps === 30);

const envText = "MONTARA_A=alpha\nexport MONTARA_B='bravo'\n# ignored\n";
const parsedEnv = parseEnvText(envText);
ok("env parser handles bare and export assignments", parsedEnv.MONTARA_A === "alpha" && parsedEnv.MONTARA_B === "bravo");
const envDir = join(process.cwd(), "out", "verify-env");
mkdirSync(envDir, { recursive: true });
writeFileSync(join(envDir, ".env"), "MONTARA_VERIFY_ENV=from-file\nMONTARA_EXISTING=from-file\n");
const savedExisting = process.env.MONTARA_EXISTING;
delete process.env.MONTARA_VERIFY_ENV;
process.env.MONTARA_EXISTING = "kept";
loadEnv(envDir);
ok("env loader reads .env without clobbering existing values",
  getEnv("MONTARA_VERIFY_ENV") === "from-file" && getEnv("MONTARA_EXISTING") === "kept");
let missingEnvThrows = false;
try { requireEnv("MONTARA_MISSING_FOR_VERIFY"); } catch (e) { missingEnvThrows = String(e).includes("Required environment variable 'MONTARA_MISSING_FOR_VERIFY' is not set"); }
ok("required env accessor reports missing keys", missingEnvThrows);
delete process.env.MONTARA_VERIFY_ENV;
if (savedExisting == null) delete process.env.MONTARA_EXISTING;
else process.env.MONTARA_EXISTING = savedExisting;

const expectedProfiles = [
  ["youtube_landscape", 1920, 1080, "16:9", 30, "libx264", "aac", 18, null, null, "srt"],
  ["youtube_4k", 3840, 2160, "16:9", 30, "libx264", "aac", 18, null, null, "srt"],
  ["youtube_shorts", 1080, 1920, "9:16", 30, "libx264", "aac", 20, null, 60, "srt"],
  ["instagram_reels", 1080, 1920, "9:16", 30, "libx264", "aac", 20, 250, 90, "srt"],
  ["instagram_feed", 1080, 1080, "1:1", 30, "libx264", "aac", 20, 250, 60, "srt"],
  ["tiktok", 1080, 1920, "9:16", 30, "libx264", "aac", 20, 287, 600, "srt"],
  ["linkedin", 1920, 1080, "16:9", 30, "libx264", "aac", 20, 5120, 600, "srt"],
  ["cinematic", 2560, 1080, "21:9", 24, "libx264", "aac", 16, null, null, "srt"],
  ["generic_hd", 1920, 1080, "16:9", 30, "libx264", "aac", 23, null, null, "srt"],
] as const;
ok("9 media profiles are registered", Object.keys(ALL_PROFILES).length === 9);
ok("media profile dimensions, fps and limits match the source table", expectedProfiles.every((row) => {
  const p = getProfile(row[0]);
  return p.width === row[1] &&
    p.height === row[2] &&
    p.aspect_ratio === row[3] &&
    p.fps === row[4] &&
    p.codec === row[5] &&
    p.audio_codec === row[6] &&
    p.crf === row[7] &&
    p.max_file_size_mb === row[8] &&
    p.max_duration_seconds === row[9] &&
    p.caption_format === row[10];
}));
ok("platform profile lookup uses the name prefix", getProfilesForPlatform("youtube").length === 3);
ok("FFmpeg profile args match the render contract",
  ffmpegOutputArgs(getProfile("cinematic")).join("|") === "-c:v|libx264|-c:a|aac|-crf|16|-pix_fmt|yuv420p|-r|24|-vf|scale=2560:1080");

ok("delivery promise rule table carries all 8 promise types", Object.keys(PROMISE_RULES).length === 8);
const motionPromise = new DeliveryPromise({
  promise_type: PromiseType.MOTION_LED,
  motion_required: true,
  source_required: false,
  tone_mode: "cinematic",
  quality_floor: "presentable",
});
const promiseRoundTrip = DeliveryPromise.fromDict(motionPromise.toDict());
ok("delivery promise serializes with the original field names", promiseRoundTrip.promise_type === PromiseType.MOTION_LED && promiseRoundTrip.tone_mode === "cinematic");
const cutCheck = motionPromise.validateCuts([
  { source: "shot.mp4" },
  { type: "text_card" },
  { source: "still.png" },
]);
ok("delivery validator counts only real footage, animation and avatar as motion",
  !cutCheck.valid &&
  cutCheck.motion_cuts === 1 &&
  cutCheck.slide_cuts === 1 &&
  cutCheck.still_cuts === 1 &&
  Math.abs(cutCheck.motion_ratio - (1 / 3)) < 1e-9);
const approvedStillFallback = new DeliveryPromise({
  promise_type: PromiseType.MOTION_LED,
  motion_required: true,
  source_required: false,
  tone_mode: "cinematic",
  quality_floor: "presentable",
  approved_fallback: "still_led",
}).validateCuts([{ type: "text_card" }, { source: "still.png" }]);
ok("approved still-led fallback waives only the fallback blocker",
  !approvedStillFallback.valid &&
  approvedStillFallback.violations.length === 1 &&
  approvedStillFallback.violations[0]?.startsWith("Motion ratio") === true);
const noCuts = motionPromise.validateCuts([]);
ok("delivery validator rejects an empty cut list", !noCuts.valid && noCuts.violations[0] === "No cuts provided");
const avatarPromise = classifyFromBrief("talking-head", {});
const sourceOverride = classifyFromBrief("animated-explainer", { has_footage: true });
const softenedMotion = classifyFromBrief("cinematic", { motion_required: false });
ok("delivery classifier maps pipeline defaults and explicit source footage",
  avatarPromise.promise_type === PromiseType.AVATAR_PRESENTER &&
  avatarPromise.motion_required &&
  sourceOverride.promise_type === PromiseType.SOURCE_LED &&
  sourceOverride.source_required);
ok("delivery classifier softens motion-led when intent says motion is not required",
  softenedMotion.promise_type === PromiseType.HYBRID && !softenedMotion.motion_required);

console.log("\n== render (REAL ffmpeg) ==");
const out = join(process.cwd(), "out", "verify.mp4");
try { rmSync(out, { force: true }); } catch { /* none */ }
let rendered = false;
try {
  renderScenePlan(plan, out);
  rendered = true;
} catch (e) {
  console.log("  render error:", String(e).slice(0, 500));
}
ok("scene plan produced an MP4 on disk", rendered && existsSync(out));
if (rendered && existsSync(out)) {
  const d = probeDuration(out);
  ok("rendered duration ~= 3.0s", Math.abs(d - 3.0) < 0.4, `got ${d.toFixed(2)}s`);
}

const timelineOut = join(process.cwd(), "out", "verify-timeline.mp4");
try { rmSync(timelineOut, { force: true }); } catch { /* none */ }
let timelineRendered = false;
try {
  renderTimeline(timeline, timelineOut);
  timelineRendered = true;
} catch (e) {
  console.log("  timeline render error:", String(e).slice(0, 500));
}
ok("Timeline IR produced an MP4 on disk", timelineRendered && existsSync(timelineOut));
if (timelineRendered && existsSync(timelineOut)) {
  const d = probeDuration(timelineOut);
  ok("Timeline render duration ~= 3.0s", Math.abs(d - 3.0) < 0.4, `got ${d.toFixed(2)}s`);
}
const remotionProps = timelineToRemotionProps(timeline);
ok("Timeline IR compiles to Remotion Explainer props",
  remotionProps.width === timeline.composition.width &&
    remotionProps.height === timeline.composition.height &&
    remotionProps.fps === timeline.composition.fps &&
    remotionProps.cuts.length === plan.scenes.length &&
    remotionProps.cuts.every((cut) => cut.type === "text_card" && cut.out_seconds > cut.in_seconds));
ok("Remotion native default is explicit-env gated",
  !remotionDefaultEnabled({}) && remotionDefaultEnabled({ REMOTION_ENABLED: "1" }));

console.log("\n== pipelines ==");
const pipes = listPipelines();
ok("12 pipelines registered", pipes.length === 12, `got ${pipes.length}`);
let allValid = true;
for (const p of pipes) {
  const sp = planVideo(p.id, "verify idea", { targetSeconds: 12 });
  const tl = scenePlanToTimeline(sp);
  const issues = validateTimeline(tl);
  if (sp.scenes.length === 0 || issues.length) {
    allValid = false;
    console.log(`    ${p.id}: ${issues.join("; ") || "no scenes"}`);
  }
}
ok("every pipeline yields a valid Timeline IR", allValid);

const pipeOut = join(process.cwd(), "out", "verify-pipeline.mp4");
try { rmSync(pipeOut, { force: true }); } catch { /* none */ }
let pipeRendered = false;
try {
  renderScenePlan(planVideo("cinematic", "the strait", { targetSeconds: 3 }), pipeOut);
  pipeRendered = true;
} catch (e) {
  console.log("  pipeline render error:", String(e).slice(0, 400));
}
ok("a pipeline plan renders to MP4", pipeRendered && existsSync(pipeOut));

console.log("\n== providers ==");
const tools = listProviderTools();
ok("phase 1.3 seed provider tools registered", tools.length === 9, `got ${tools.length}`);
const categories = new Set(tools.map((tool) => tool.category));
ok("provider tools cover video/image/tts/music/post/analysis", ["video", "image", "tts", "music", "post", "analysis"].every((c) => categories.has(c as never)));

console.log("\n== intelligence (§H) ==");
const trail = new DecisionTrail();
const queries = planResearchQueries("strait of hormuz oil chokepoint risk");
ok("research plans 15-25 searches", queries.length >= 15 && queries.length <= 25, `got ${queries.length}`);
const research = runResearch("strait of hormuz oil chokepoint risk", { trail });
ok("research yields findings + angles offline", research.findings.length > 0 && research.angles.length === 5);

const footage = indexFootage([
  { id: "ocean", title: "Calm ocean waves at sunset", tags: ["ocean", "sea", "waves", "water", "calm"] },
  { id: "city", title: "Busy city traffic at night", tags: ["city", "cars", "traffic", "street", "night"] },
  { id: "forest", title: "Forest trail in morning fog", tags: ["forest", "trees", "trail", "fog", "nature"] },
]);
const top = retrieveFootage("calm ocean water waves", footage, 3)[0];
ok("CLIP-indexed retrieval ranks the semantically closest clip", top?.item.id === "ocean", `got ${top?.item.id}`);

ok("selection weights sum to 100", Object.values(SELECTION_WEIGHTS).reduce((a, b) => a + b, 0) === 100);
const pick = selectProviderTool(tools, "video", { trail });
ok("7-dim scored selection picks a video-category tool", pick.chosen.item.category === "video", `got ${pick.chosen.item.category}`);

ok("decision audit trail records choices with confidence", trail.length >= 2 && trail.entries().every((e) => e.confidence >= 0 && e.confidence <= 1));

console.log("\n== governance (§I) ==");
const staticTl = scenePlanToTimeline({ width: 1920, height: 1080, fps: 30, scenes: [{ id: "hold", title: "One long static hold", durationSec: 12, background: "101820" }] });
const staticRisk = slideshowRisk(staticTl);
ok("slideshow-risk flags a long static silent hold as high", staticRisk.level === "high", `got ${staticRisk.level} (${staticRisk.score})`);
const pacedRisk = slideshowRisk(timeline);
ok("slideshow-risk scores a paced cut lower than a static hold", pacedRisk.score < staticRisk.score, `${pacedRisk.score} vs ${staticRisk.score}`);

const goodGate = preComposeGate(timeline, { targetDurationSec: timeline.composition.durationSec }, { rendererAvailable: true });
ok("pre-compose gate proceeds on a kept promise", goodGate.ok, goodGate.blockers.join("; "));
const badGate = preComposeGate(timeline, { targetDurationSec: 99 }, { rendererAvailable: true });
ok("pre-compose gate blocks a broken delivery promise", !badGate.ok && badGate.blockers.length > 0);
const noRenderer = preComposeGate(timeline, {}, { rendererAvailable: false });
ok("pre-compose gate blocks a missing renderer", !noRenderer.ok);

const ledger = new BudgetLedger({ mode: "cap", perActionCap: 0.5, totalCap: 10 });
ok("budget approves an in-cap reservation", ledger.reserve("tts", 0.4).approved);
ok("budget rejects an over-per-action reservation in cap mode", !ledger.reserve("video-gen", 5).approved);
const r = ledger.reserve("image", 0.3);
ledger.reconcile(r.id, 0.25);
ok("budget reconciles actuals and tracks remaining", ledger.report().remaining < 10 && ledger.report().reserved > 0);

console.log("\n== agent layer (§K) ==");
let manifestsInSync = PIPELINE_DEFS.length === 12;
for (const def of PIPELINE_DEFS) {
  const path = join(process.cwd(), "pipelines", `${def.id}.yaml`);
  if (!existsSync(path)) { manifestsInSync = false; console.log(`    missing manifest ${def.id}.yaml`); continue; }
  const onDisk = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (onDisk !== renderPipelineManifest(def)) { manifestsInSync = false; console.log(`    drift in ${def.id}.yaml`); }
}
ok("12 YAML pipeline manifests are in sync with code", manifestsInSync);

ok("scene plan validates against its JSON schema", validateJson(plan, scenePlanSchema).length === 0, validateJson(plan, scenePlanSchema).join("; "));
ok("a broken scene plan is rejected by the schema", validateJson({ width: 0, scenes: [] }, scenePlanSchema).length > 0);
ok("Timeline IR validates against its JSON schema", validateJson(timeline, timelineSchema).length === 0, validateJson(timeline, timelineSchema).join("; "));
ok("pipeline manifest validates against the pipeline schema", validateJson(getPipeline("cinematic"), pipelineSchema).length === 0);

let cp = createCheckpoint("verify idea", "documentary-montage", "run-verify");
cp = advanceCheckpoint(cp, "research");
cp = advanceCheckpoint(cp, "plan");
ok("checkpoint reports the next unfinished stage", nextStage(cp) === "script", `got ${nextStage(cp)}`);
const cpPath = join(process.cwd(), "out", "verify-checkpoint.json");
saveCheckpoint(cp, cpPath);
let resumed = loadCheckpoint(cpPath);
for (const stage of ["script", "populate", "enrich", "render", "qa", "master"] as const) resumed = advanceCheckpoint(resumed, stage);
ok("a saved checkpoint resumes to completion", isComplete(resumed) && resumed.done && resumed.runId === "run-verify");

ok("five per-assistant configs are generated", ASSISTANT_TARGETS.length === 5);
ok("each assistant config points at the skills entry", ASSISTANT_TARGETS.every((t) => renderAssistantConfig(t).includes(SKILLS_ENTRY)));

console.log("\n== video providers (§C) ==");
ok("all 14 video generation providers are registered", VIDEO_PROVIDERS.length === 14, `got ${VIDEO_PROVIDERS.length}`);
ok("video providers span cloud + local-runtime + stock tiers", ["cloud", "local-runtime", "stock"].every((t) => VIDEO_PROVIDERS.some((p) => p.tier === t)));
ok("every video provider is category video", VIDEO_PROVIDERS.every((p) => p.category === "video"));

const kling = getVideoProvider("kling")!;
ok("provider is unavailable without its credential", !providerAvailable(kling, {}));
ok("provider becomes available with its credential", providerAvailable(kling, { KLING_API_KEY: "k" }));

const vInput = { prompt: "an oil tanker crossing a narrow strait", outPath: join(process.cwd(), "out", "verify-video.mp4"), durationSec: 4, width: 1280, height: 720 };
const pexelsReq = buildVideoRequest(getVideoProvider("pexels-video")!, vInput, { PEXELS_API_KEY: "pk" });
ok("stock request is a GET with the query + auth", pexelsReq.method === "GET" && pexelsReq.url.includes("query=") && pexelsReq.headers.Authorization === "pk");
const klingReq = buildVideoRequest(kling, vInput, { KLING_API_KEY: "k" });
ok("cloud request is a Bearer POST carrying the prompt", klingReq.method === "POST" && klingReq.headers.Authorization === "Bearer k" && Boolean(klingReq.body?.includes("strait")));

const offlinePlan = planVideoGeneration(vInput, {});
ok("with no credentials a plan falls back to local-free", offlinePlan.mode === "fallback" && offlinePlan.provider.tier === "local-free");
const keyedPlan = planVideoGeneration({ ...vInput, providerId: "runway-gen3" }, { RUNWAY_API_KEY: "rk" });
ok("a credentialed provider yields a request plan", keyedPlan.mode === "request" && keyedPlan.provider.id === "runway-gen3" && Boolean(keyedPlan.request));

const mediaPick = selectMediaProvider(VIDEO_PROVIDERS.filter((p) => p.tier === "cloud"), { trail });
ok("scored selection ranks a cloud video provider", mediaPick.chosen.item.tier === "cloud");

const vGen = runVideoGeneration(vInput, {});
ok("offline video generation renders a real fallback MP4", Boolean(vGen.result) && existsSync(vInput.outPath));
void listVideoProviders;

console.log("\n== image providers (§D) ==");
ok("all 10 image generation providers are registered", IMAGE_PROVIDERS.length === 10, `got ${IMAGE_PROVIDERS.length}`);
ok("image providers span cloud + local-runtime + stock tiers", ["cloud", "local-runtime", "stock"].every((t) => IMAGE_PROVIDERS.some((p) => p.tier === t)));
ok("every image provider is category image", IMAGE_PROVIDERS.every((p) => p.category === "image"));

const iInput = { prompt: "a narrow strait seen from orbit", outPath: join(process.cwd(), "out", "verify-image.png"), width: 512, height: 512 };
const dalleReq = buildImageRequest(getImageProvider("dalle3")!, iInput, { OPENAI_API_KEY: "ok" });
ok("OpenAI image request is a Bearer POST with GPT Image 2 model + prompt", dalleReq.method === "POST" && dalleReq.headers.Authorization === "Bearer ok" && Boolean(dalleReq.body?.includes("gpt-image-2")));
const fluxReq = buildImageRequest(getImageProvider("flux")!, iInput, { BFL_API_KEY: "bk-secret" });
ok("BFL FLUX.2 request uses x-key auth and async polling_url", fluxReq.method === "POST" && fluxReq.url.endsWith("/flux-2-pro-preview") && fluxReq.headers["x-key"] === "bk-secret" && fluxReq.poll?.field === "polling_url");
const imagenReq = buildImageRequest(getImageProvider("imagen")!, iInput, { GEMINI_API_KEY: "gk" });
ok("Google image request uses Gemini image model + key query + image modality", imagenReq.url.includes("gemini-3.1-flash-image") && imagenReq.url.includes("key=gk") && !("Authorization" in imagenReq.headers) && Boolean(imagenReq.body?.includes("responseModalities")));
const unsplashReq = buildImageRequest(getImageProvider("unsplash")!, iInput, { UNSPLASH_ACCESS_KEY: "uk" });
ok("Unsplash request is a GET with Client-ID auth", unsplashReq.method === "GET" && unsplashReq.headers.Authorization === "Client-ID uk");

const runwayReq = buildVideoRequest(getVideoProvider("runway-gen3")!, vInput, { RUNWAY_API_KEY: "rk-secret" });
ok("Runway request uses versioned task API with promptText", runwayReq.url.endsWith("/text_to_video") && runwayReq.headers["X-Runway-Version"] === "2024-11-06" && Boolean(runwayReq.body?.includes("promptText")));
const veoReq = buildVideoRequest(getVideoProvider("google-veo3")!, vInput, { GEMINI_API_KEY: "gk" });
ok("Veo request uses 3.1 long-running endpoint and typed parameters", veoReq.url.includes("veo-3.1-generate-preview:predictLongRunning") && veoReq.url.includes("key=gk") && Boolean(veoReq.body?.includes("durationSeconds")));
const redactedFlux = redactProviderRequest(fluxReq);
ok("provider request redaction removes secrets from headers and URLs", redactedFlux.headers["x-key"] === "[REDACTED]" && !redactedFlux.url.includes("bk-secret"));

const fixtureArtifact = join(process.cwd(), "out", "verify-provider-live-fixture.bin");
const fixtureExec = await executeProviderRequest(getImageProvider("flux")!, fluxReq, {
  outPath: fixtureArtifact,
  fetch: async (url, init) => {
    if (init.method === "POST") {
      return { ok: true, status: 200, json: async () => ({ id: "job_123", polling_url: "https://api.bfl.ai/v1/get_result?id=job_123" }) };
    }
    return { ok: true, status: 200, json: async () => ({ status: "Ready", result: { sample: "https://cdn.example/flux.png" }, seed: 42 }) };
  },
  download: async () => new Uint8Array([1, 2, 3, 4]),
});
ok("BYOK executor replays sanitized async fixture and writes artifact", fixtureExec.ok && fixtureExec.polls === 1 && fixtureExec.outputUrl === "https://cdn.example/flux.png" && existsSync(fixtureArtifact));

const providerFixtures = buildProviderAuditFixtures();
const providerCloudCount = cloudProviders().length;
ok("provider audit fixture builder covers every cloud video/image/tts/music provider", providerFixtures.length === providerCloudCount && providerFixtures.length >= 18,
  `fixtures ${providerFixtures.length}, cloud ${providerCloudCount}`);
ok("provider audit fixtures are parseable and secret-redacted", providerFixtures.every((fixture) => fixture.issues.length === 0),
  providerFixtures.filter((fixture) => fixture.issues.length).map((fixture) => `${fixture.providerId}: ${fixture.issues.join(", ")}`).join("; "));
ok("provider audit fixtures include the remaining long-tail cloud providers", ["kling", "grok-image", "recraft", "minimax-video", "heygen", "suno", "elevenlabs-music", "elevenlabs-sfx"].every((id) => providerFixtures.some((fixture) => fixture.providerId === id)));
const providerAuditReport = buildProviderAuditReport();
ok("provider audit report summarizes fixture validity", providerAuditReport.total === providerFixtures.length && providerAuditReport.invalid === 0);
const providerAuditPath = join(process.cwd(), "out", "verify-provider-audit-fixtures.json");
writeProviderAuditReport(providerAuditPath);
ok("provider audit report writes a sanitized JSON fixture file", existsSync(providerAuditPath) && !readFileSync(providerAuditPath, "utf8").includes("fixture-redaction-marker"));
const drySmoke = await runProviderSmoke({ providerId: "flux", category: "image", env: {} });
ok("provider smoke dry-run builds a redacted request without requiring keys", drySmoke.ok && drySmoke.mode === "dry-run" && drySmoke.redactedRequest.headers["x-key"] === "[REDACTED]");
const blockedSmoke = await runProviderSmoke({ providerId: "flux", category: "image", live: true, env: { BFL_API_KEY: "bk" } });
ok("provider live smoke is blocked without explicit opt-in", !blockedSmoke.ok && blockedSmoke.mode === "blocked" && Boolean(blockedSmoke.nextStep?.includes("MONTARA_LIVE_PROVIDER_SMOKE")));
const liveSmoke = await runProviderSmoke({
  providerId: "flux",
  category: "image",
  live: true,
  env: { BFL_API_KEY: "bk", MONTARA_LIVE_PROVIDER_SMOKE: "1" },
  outPath: join(process.cwd(), "out", "verify-provider-smoke-live.bin"),
  fetch: async (_url, init) => init.method === "POST"
    ? { ok: true, status: 200, json: async () => ({ polling_url: "https://api.bfl.ai/v1/get_result?id=live_fixture" }) }
    : { ok: true, status: 200, json: async () => ({ status: "Ready", result: { sample: "https://cdn.example/live.png" } }) },
  download: async () => new Uint8Array([5, 4, 3, 2]),
});
ok("provider live smoke harness executes through the BYOK executor when explicitly opted in", liveSmoke.ok && liveSmoke.mode === "live" && liveSmoke.execution?.outputUrl === "https://cdn.example/live.png");

const offlineImg = planImageGeneration(iInput, {});
ok("with no credentials an image plan falls back to local-free", offlineImg.mode === "fallback" && offlineImg.provider.tier === "local-free");
const keyedImg = planImageGeneration({ ...iInput, providerId: "flux" }, { BFL_API_KEY: "bk" });
ok("a credentialed image provider yields a request plan", keyedImg.mode === "request" && keyedImg.provider.id === "flux");

const iGen = runImageGeneration(iInput, {});
ok("offline image generation writes a real fallback PNG", Boolean(iGen.result) && existsSync(iInput.outPath));

console.log("\n== audio: tts + music + mix + enhance (§E) ==");
ok("4 TTS providers registered (incl. local Piper)", TTS_PROVIDERS.length === 4 && TTS_PROVIDERS.some((p) => p.id === "piper"));
ok("3 music/SFX providers registered", MUSIC_PROVIDERS.length === 3);

const ttsReq = buildTtsRequest(getTtsProvider("openai-tts")!, { text: "the strait carries a fifth of seaborne oil", outPath: "x" }, { OPENAI_API_KEY: "ok" });
ok("OpenAI TTS request is a Bearer POST carrying the text", ttsReq.method === "POST" && ttsReq.headers.Authorization === "Bearer ok" && Boolean(ttsReq.body?.includes("seaborne")));
const elevenReq = buildTtsRequest(getTtsProvider("elevenlabs-tts")!, { text: "hi", outPath: "x", voice: "VOICEID" }, { ELEVENLABS_API_KEY: "ek" });
ok("ElevenLabs TTS request uses xi-api-key + voice in the URL", elevenReq.headers["xi-api-key"] === "ek" && elevenReq.url.includes("VOICEID"));

const speechPlan = planSpeechGeneration({ text: "hello", outPath: "x" }, {});
ok("with no key speech falls back to the silent voice bed", speechPlan.mode === "fallback" && speechPlan.provider.id === "local.silent-voice");

const voicePath = join(process.cwd(), "out", "verify-tts.wav");
const musicPath = join(process.cwd(), "out", "verify-music.wav");
const speech = runSpeechGeneration({ text: "a measured line of narration about the strait", outPath: voicePath, durationSec: 1.2 }, {});
ok("offline TTS writes a real PCM voice bed", Boolean(speech.result) && existsSync(voicePath) && probeDuration(voicePath) > 0.8);
const music = runMusicGeneration({ prompt: "tense documentary underscore", outPath: musicPath, durationSec: 1.2 }, {});
ok("offline music writes a real tone score", Boolean(music.result) && existsSync(musicPath) && probeDuration(musicPath) > 0.8);
const musicAnalysis = analyzeMusic(musicPath);
const scoreCues = planSceneMappedMusic(musicAnalysis, [
  { id: "hook", startSec: 0, endSec: 0.6, role: "hook", emphasis: "high" },
  { id: "explain", startSec: 0.6, endSec: 1.2, role: "support", emphasis: "medium" },
]);
ok("music analyzer inspects real audio and returns quality gates",
  musicAnalysis.ok &&
  musicAnalysis.durationSec > 0.8 &&
  musicAnalysis.qualityGates.some((g) => g.id === "target-lufs") &&
  musicAnalysis.suggestions.some((s) => s.includes("-14 LUFS")));
ok("scene-mapped music planner adds fades, gain, and intentional silence",
  scoreCues.length === 2 &&
  scoreCues[0]!.silenceBeforeSec > 0 &&
  scoreCues.every((cue) => cue.fadeInSec >= 0 && cue.fadeOutSec > 0 && cue.gainDb < 0));

const mixPath = join(process.cwd(), "out", "verify-mix.wav");
mixAudioTracks({ tracks: [{ path: voicePath, volume: 1 }, { path: musicPath, volume: 0.5, delaySec: 0.2 }], outPath: mixPath, duckUnderFirst: true });
ok("audio mixer combines voice + music into a real track", existsSync(mixPath) && probeDuration(mixPath) > 0.8);

const enhancedPath = join(process.cwd(), "out", "verify-enhanced.wav");
enhanceAudio({ inputPath: mixPath, outPath: enhancedPath, targetLufs: -14 });
ok("audio enhancer normalizes to a real output track", existsSync(enhancedPath) && probeDuration(enhancedPath) > 0.8);

console.log("\n== post / enhancement (§F) ==");
const clipA = join(process.cwd(), "out", "verify-clipA.mp4");
const clipB = join(process.cwd(), "out", "verify-clipB.mp4");
renderScenePlan({ width: 480, height: 270, fps: 30, scenes: [{ id: "a", title: "Clip A", durationSec: 1, background: "101820" }] }, clipA);
renderScenePlan({ width: 480, height: 270, fps: 30, scenes: [{ id: "b", title: "Clip B", durationSec: 1, background: "214f4b" }] }, clipB);

const gradePath = join(process.cwd(), "out", "verify-grade.mp4");
colorGrade({ inputPath: clipA, outPath: gradePath });
ok("color grade writes a real graded MP4", existsSync(gradePath) && probeDuration(gradePath) > 0.8);

const xfadePath = join(process.cwd(), "out", "verify-xfade.mp4");
crossfadeStitch({ inputPaths: [clipA, clipB], outPath: xfadePath, crossfadeSec: 0.3 });
ok("crossfade stitch overlaps two clips into one", existsSync(xfadePath) && probeDuration(xfadePath) > 1.4);

const pipPath = join(process.cwd(), "out", "verify-pip.mp4");
pictureInPicture({ basePath: clipA, overlayPath: clipB, outPath: pipPath, scale: 0.3, position: "bottom-right" });
ok("picture-in-picture overlays a clip", existsSync(pipPath) && probeDuration(pipPath) > 0.8);

const upPath = join(process.cwd(), "out", "verify-upscale.mp4");
upscaleVideo({ inputPath: clipA, outPath: upPath, factor: 2 });
ok("lanczos upscale writes a real MP4", existsSync(upPath) && probeDuration(upPath) > 0.8);

ok("10 model enhancement tools registered, including matting and tracking", ENHANCEMENT_TOOLS.length === 10);
ok("enhancement tools cover upscale/bg-remove/matting/refine/tracking/face/avatar/lip-sync",
  ["upscale", "bg-remove", "matting", "mask-refine", "motion-track", "face-enhance", "face-restore", "talking-head", "lip-sync"].every((k) => ENHANCEMENT_TOOLS.some((t) => t.kind === k)));
const esrgan = getEnhancementTool("real-esrgan")!;
ok("enhancer is unavailable without its runtime, available with it", !enhancementAvailable(esrgan, {}) && enhancementAvailable(esrgan, { REALESRGAN_BIN: "x" }) && esrgan.hasLocalFallback);
const mattingPlan = planMattingPipeline({ SAM2_URL: "http://localhost:7861", BIREFNET_URL: "http://localhost:7862", OPENCV_TRACKING: "1" });
ok("matting pipeline can plan text-behind-subject quality stages",
  mattingPlan.supportsTextBehindSubject &&
  mattingPlan.stages.some((s) => s.id === "edge-refine" && s.tool === "birefnet") &&
  mattingPlan.stages.some((s) => s.id === "temporal-stability" && s.tool === "opencv-tracker"));

console.log("\n== analysis / understanding (§G) ==");
const sceneClip = join(process.cwd(), "out", "verify-scenes.mp4");
renderScenePlan({ width: 480, height: 270, fps: 30, scenes: [
  { id: "r", title: "Red", durationSec: 0.8, background: "cc1111" },
  { id: "g", title: "Green", durationSec: 0.8, background: "11cc11" },
  { id: "b", title: "Blue", durationSec: 0.8, background: "1111cc" },
] }, sceneClip);

const multiScenes = detectScenes(sceneClip);
const singleScenes = detectScenes(clipA);
ok("scene detect finds cuts in a multi-scene clip", multiScenes.cuts.length >= 1, `cuts ${multiScenes.cuts.length}`);
ok("scene detect finds fewer cuts in a single-scene clip", singleScenes.cuts.length < multiScenes.cuts.length);

const framesDir = join(process.cwd(), "out", "verify-frames");
const sampled = sampleKeyFrames(sceneClip, framesDir, { maxFrames: 5 });
ok("intelligent frame sampler writes real frames", sampled.length >= 2 && sampled.every((f) => existsSync(f.path)));

const transcript = transcribe({ inputPath: sceneClip }, {});
ok("transcriber degrades to an empty transcript with no runtime", transcript.engine === "none" && transcript.segments.length === 0);

const understanding = understandVideo(sceneClip, { maxFrames: 3 });
ok("video understanding emits frame descriptors, tags, and five-aspect shot breakdowns",
  understanding.frames.length >= 2 &&
  understanding.tags.length >= 5 &&
  understanding.sceneCount >= 2 &&
  understanding.aspectBreakdown.length >= 1 &&
  understanding.aspectBreakdown.every((shot) => Boolean(shot.subject && shot.subjectMotion && shot.scene && shot.spatialFraming && shot.camera)));

const refAnalysis = analyzeReferenceVideo(sceneClip, {});
ok("reference analysis proposes concepts, capability-aware needs, and a cost estimate",
  refAnalysis.concepts.length >= 2 &&
  refAnalysis.concepts.length <= 3 &&
  refAnalysis.referenceNeeds.length >= 1 &&
  refAnalysis.costEstimateUsd > 0);

console.log("\n== render engines (§A) ==");
ok("9 composition/capture engines registered", listEngines().length === 9);
ok("engines include revideo/motion-canvas/three/manim/blender/spline/playwright", ["revideo", "motion-canvas", "three", "manim", "blender", "spline", "playwright"].every((id) => Boolean(getEngine(id))));
ok("engine registry marks adapter/runtime/planned maturity honestly",
  getEngine("remotion")?.maturity === "adapter" &&
  getEngine("playwright")?.maturity === "runtime-gated" &&
  getEngine("spline")?.maturity === "planned");
ok("scene-type auto-pick maps kinetic-typography to Motion Canvas", preferredEngine("kinetic-typography").id === "motion-canvas");
ok("scene-type auto-pick maps 3d to three.js and math to Manim", preferredEngine("3d").id === "three" && preferredEngine("math").id === "manim");
ok("an engine is unavailable without its runtime, ffmpeg always available", !engineAvailable(getEngine("three")!, {}) && engineAvailable(getEngine("ffmpeg")!, {}));

const engineOut = join(process.cwd(), "out", "verify-engine.mp4");
const engResult = renderWithEngine("motion-canvas", timeline, engineOut, {});
ok("generic engine dispatcher degrades honestly to ffmpeg and renders a real MP4", existsSync(engineOut) && engResult.renderer === "degraded-ffmpeg" && engResult.note.includes("fallback"));
const ffOut = join(process.cwd(), "out", "verify-engine-ff.mp4");
const ffResult = renderWithEngine("ffmpeg", timeline, ffOut, {});
ok("the ffmpeg engine renders natively", existsSync(ffOut) && ffResult.renderer === "native");

console.log("\n== style + output profiles (§J) ==");
ok("3 style playbooks + 6 output profiles registered", STYLE_PLAYBOOKS.length === 3 && OUTPUT_PROFILES.length === 6);
ok("output profiles cover 16:9, 9:16, 1:1 and 21:9", ["16:9", "9:16", "1:1", "21:9"].every((a) => OUTPUT_PROFILES.some((p) => p.aspect === a)));

const styled = applyStyle(timeline, "flat-motion");
const styledText = styled.tracks.flatMap((t) => t.clips).find((c) => c.type === "text");
ok("applying a style restyles text + sets the background", styled.composition.background === "111111" && styledText?.type === "text" && styledText.style?.fontFamily === "Poppins");
ok("a styled timeline still validates", validateTimeline(styled).length === 0);

const shorts = applyOutputProfile(timeline, "shorts");
const shortsText = shorts.tracks.flatMap((t) => t.clips).find((c) => c.type === "text");
ok("applying the shorts profile resizes to 1080x1920", shorts.composition.width === 1080 && shorts.composition.height === 1920);
ok("output profile re-centers positioned text", shortsText?.transform?.x === 540 && shortsText.transform?.y === 960);
ok("a re-profiled timeline still validates", validateTimeline(shorts).length === 0);
void getOutputProfile;

console.log("\n== tool contract (P0) ==");
const registry = buildDefaultRegistry();
const eleven = registry.get("elevenlabs_tts");
ok("registry holds the ported elevenlabs_tts tool", Boolean(eleven) && eleven instanceof ElevenLabsTTS);
const tts = new ElevenLabsTTS();
ok("BaseTool contract fields are correct", tts.tier === "voice" && tts.capability === "tts" && tts.runtime === "api" && tts.fallbackTools.length === 2);
ok("status is key-gated (unavailable without key, available with it)", tts.getStatus({}) === "unavailable" && tts.getStatus({ ELEVENLABS_API_KEY: "k" }) === "available");
ok("cost estimate uses the source character formula", Math.abs(tts.estimateCost({ text: "hello" }) - 0.0015) < 1e-9);
const req = tts.buildRequest({ text: "the strait", voice_id: "VID", similarity_boost: 0.9 }, "APIKEY");
ok("request URL hits /text-to-speech/{voice} with output_format", req.url.includes("/v1/text-to-speech/VID") && req.url.includes("output_format="));
ok("request carries expected headers (xi-api-key + Accept: audio/mpeg)", req.headers["xi-api-key"] === "APIKEY" && req.headers.Accept === "audio/mpeg");
ok("request body carries voice_settings (the field our stub was missing)", req.body.includes("voice_settings") && req.body.includes("\"similarity_boost\":0.9"));
ok("idempotency key is deterministic", tts.idempotencyKey({ text: "a", voice_id: "v", model_id: "m" }) === tts.idempotencyKey({ text: "a", voice_id: "v", model_id: "m" }));

console.log("\n== lib intelligence (P2) ==");
const approx = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

// Weighted-score fidelity (provider 30/20/15/15/10/5/5, path 25/20/15/10/10/8/7/5).
const pScore = new ProviderScore({
  tool_name: "t", provider: "p", task_fit: 0.8, output_quality: 0.6, control: 0.5,
  reliability: 0.9, cost_efficiency: 0.7, latency: 0.4, continuity: 0.5,
});
ok("provider weighted score matches source weights", approx(pScore.weighted_score, 0.685));
const pathScore = new ProductionPathScore({
  path_label: "x", delivery_fit: 0.9, quality_fit: 0.8, capability_confidence: 0.7,
  fallback_integrity: 0.6, budget_fit: 0.5, speed_fit: 0.4, controllability: 0.3, consistency_fit: 0.2,
});
ok("production path weighted score matches source weights", approx(pathScore.weighted_score, 0.663));

// score_provider end-to-end: synonym task-fit, control from supports, premium-cinematic bonus.
const fakeTool: ScorableTool = {
  getInfo: () => ({
    name: "kling", provider: "kling",
    best_for: ["cinematic film trailers", "dramatic motion"],
    supports: { reference_image: true, camera_direction: true, native_audio: true, multi_shot: true, cinematic_quality: true },
    stability: "production", tier: "generate", capability: "video_generation", runtime: "api",
  }),
  getStatus: () => "available",
  estimateCost: () => 0.5,
};
const sp2 = scoreProvider(fakeTool, { intent: "cinematic trailer", asset_type: "video", motion_required: true, budget_remaining_usd: 10.0 });
ok("scoreProvider task_fit applies synonym overlap + cinematic bonus", approx(sp2.task_fit, 0.95));
ok("scoreProvider output_quality caps at 1.0 with premium bonus", approx(sp2.output_quality, 1.0));
ok("scoreProvider control weights supports features", approx(sp2.control, 0.324324, 1e-5));
ok("scoreProvider reliability/cost/latency/continuity match source", approx(sp2.reliability, 0.95) && approx(sp2.cost_efficiency, 0.8) && approx(sp2.latency, 0.4) && approx(sp2.continuity, 0.5));
ok("scoreProvider weighted score matches source ground truth", approx(sp2.weighted_score, 0.801149, 1e-5));
ok("rankProviders returns best-first", rankProviders([fakeTool], { intent: "cinematic" })[0]?.tool_name === "kling");

// slideshow risk over a scene plan (6 dims, 0-5, verdict bands).
const scenePlanScenes: Scene[] = [
  { type: "text_card", description: "intro", shot_language: { shot_size: "wide", camera_movement: "static" } },
  { type: "text_card", description: "point one", shot_language: { shot_size: "wide", camera_movement: "static" } },
  { type: "text_card", description: "point two", shot_language: { shot_size: "wide" } },
  { type: "video", description: "b-roll city", shot_language: { shot_size: "medium", camera_movement: "dolly_in" }, shot_intent: "reveal scale", hero_moment: true },
];
const risk = scoreSlideshowRisk(scenePlanScenes);
ok("slideshow risk average + verdict match source", approx(risk.average, 2.52) && risk.verdict === "acceptable");
ok("slideshow risk dimensions match source scores",
  approx(risk.dimensions.repetition!.score, 3.5) &&
  approx(risk.dimensions.decorative_visuals!.score, 3.8) &&
  approx(risk.dimensions.weak_motion!.score, 0.0) &&
  approx(risk.dimensions.typography_overreliance!.score, 4.0));
ok("slideshow risk fails an empty scene plan", scoreSlideshowRisk([]).verdict === "fail" && scoreSlideshowRisk([]).average === 5.0);

// variation checker (8 structural checks).
const variation = checkSceneVariation(scenePlanScenes);
ok("variation checker score + verdict match source", approx(variation.score, 3.0) && variation.verdict === "revise");
ok("variation checker flags 5 violations + 2 suggestions", variation.violations.length === 5 && variation.suggestions.length === 2);

// scene pacing tracer (frame-accurate).
const pacingSteps = [
  { kind: "cmd", text: "git clone repo", typeSpeed: 0.035 },
  { kind: "out", text: "Cloning..." },
  { kind: "pause", seconds: 2.0 },
  { kind: "cmd", text: "make setup" },
];
ok("stepDuration is frame-accurate for cmd/out/pause", approx(stepDuration(pacingSteps[0]!), 0.8) && approx(stepDuration(pacingSteps[1]!), 0.25) && approx(stepDuration(pacingSteps[2]!), 2.0));
const landmarks = trace(pacingSteps, 0.0, 30, { quiet: true });
ok("trace emits landmarks at exact video-times", landmarks.length === 3 && approx(landmarks[0]!.video_time, 0.0) && approx(landmarks[1]!.video_time, 0.8) && approx(landmarks[2]!.video_time, 3.05));
let alignRaised = false;
try { assertAlignment(pacingSteps, 0.0, 5.0, [[0.5, "cue"], [4.5, "late cue"]], { tolerance: 1.0 }); } catch { alignRaised = true; }
ok("assertAlignment throws when a cue has no nearby landmark", alignRaised);
let alignPassed = true;
try { assertAlignment(pacingSteps, 0.0, 3.5, [[0.0, "a"], [3.0, "b"]], { tolerance: 1.0 }); } catch { alignPassed = false; }
ok("assertAlignment passes when cues line up", alignPassed);

// source media review pure helpers.
ok("parseFps handles fractional + integer + bad rates", approx(parseFps("24000/1001"), 23.98) && approx(parseFps("30/1"), 30.0) && approx(parseFps("bad"), 0.0));
ok("sampleTimestamps spaces evenly", JSON.stringify(sampleTimestamps(10, 4)) === JSON.stringify([2.0, 4.0, 6.0, 8.0]));
ok("detectMediaType classifies by extension", detectMediaType("a.mp4") === "video" && detectMediaType("b.wav") === "audio" && detectMediaType("c.png") === "image" && detectMediaType("d.txt") === null);
const emptyReview = reviewSourceMedia([], {});
ok("reviewSourceMedia reports no media with the fully-generated implication",
  emptyReview.version === "1.0" &&
  emptyReview.files.length === 0 &&
  emptyReview.planning_implications.length === 1 &&
  emptyReview.planning_implications[0]!.startsWith("No source media available"));

console.log("\n== lib corpus/checkpoint (P3) ==");
const clipModel = modelInfo();
ok("clip model metadata matches source contract", clipModel.model_id === "openai/clip-vit-base-patch32" && clipModel.device === "cpu" && clipModel.dim === 512);
ok("empty embedder calls return empty matrices", embedTexts([]).length === 0);
const textVecs = embedTexts(["", "untitled"]);
ok("text embedder substitutes untitled for empty strings", textVecs.length === 2 && textVecs[0]!.length === EMBED_DIM && approx(textVecs[0]!.reduce((sum, v) => sum + v * v, 0), 1.0) && JSON.stringify(textVecs[0]) === JSON.stringify(textVecs[1]));
ok("frame pooling returns zero for empty input and normalizes means", poolFrames([]).every((v) => v === 0) && approx(poolFrames([normalizedVector(0), normalizedVector(0)])[0]!, 1.0));

const corpusDir = join(process.cwd(), "out", "verify-corpus-p3");
try { rmSync(corpusDir, { recursive: true, force: true }); } catch { /* none */ }
const corpus = new Corpus(corpusDir);
corpus.add(createClipRecord({ clip_id: "source_a", source: "pexels", source_id: "a", source_url: "https://example.test/a", local_path: "clips/a.mp4", motion_score: 0.9 }), normalizedVector(0), normalizedVector(1));
corpus.add(createClipRecord({ clip_id: "source_b", source: "nasa", source_id: "b", source_url: "https://example.test/b", local_path: "clips/b.mp4", motion_score: 0.4 }), normalizedVector(1), normalizedVector(0));
corpus.add(createClipRecord({ clip_id: "source_c", source: "archive", source_id: "c", source_url: "https://example.test/c", local_path: "clips/c.mp4", motion_score: 0.8 }), normalizedVector(0), normalizedVector(0));
corpus.add(createClipRecord({ clip_id: "source_a", source: "pexels", source_id: "a", source_url: "https://example.test/a", local_path: "clips/a.mp4" }), normalizedVector(2), normalizedVector(2));
ok("corpus add is idempotent by clip_id and fills defaults", corpus.length === 3 && corpus.get("source_a")?.kind === "video" && Boolean(corpus.get("source_a")?.added_at));
const rankedCorpus = corpus.rankByText(normalizedVector(0), { k: 3 });
ok("corpus fused score uses visual/tag blend", rankedCorpus[0]?.[0].clip_id === "source_c" && approx(rankedCorpus[0]?.[1] ?? 0, 1.0) && approx(rankedCorpus[1]?.[1] ?? 0, 0.7) && approx(rankedCorpus[2]?.[1] ?? 0, 0.3));
ok("corpus filters by motion floor and exclusions", corpus.rankByText(normalizedVector(0), { motionMin: 0.85, excludeIds: ["source_c"] }).map(([rec]) => rec.clip_id).join(",") === "source_a");
ok("corpus KNN excludes the seed itself", corpus.knn("source_a", 2)[0]?.[0].clip_id === "source_c");
ok("corpus similar-set uses MMR and diversify keeps first candidate", corpus.findSimilarSet("source_a", 2).length === 2 && corpus.diversify(["source_a", "source_b", "source_c"], 2)[0] === "source_a");
corpus.save();
const loadedCorpus = new Corpus(corpusDir);
loadedCorpus.load();
ok("corpus save/load preserves JSONL rows and embedding banks", loadedCorpus.length === 3 && loadedCorpus.get("source_b")?.source === "nasa" && loadedCorpus.clipEmbeddings.length === 3 && loadedCorpus.tagEmbeddings.length === 3);
const driftDir = join(process.cwd(), "out", "verify-corpus-drift-p3");
try { rmSync(driftDir, { recursive: true, force: true }); } catch { /* none */ }
mkdirSync(driftDir, { recursive: true });
writeFileSync(join(driftDir, "index.jsonl"), `${JSON.stringify(createClipRecord({ clip_id: "one", source: "s", source_id: "1", source_url: "u", local_path: "clips/1.mp4" }))}\n${JSON.stringify(createClipRecord({ clip_id: "two", source: "s", source_id: "2", source_url: "u", local_path: "clips/2.mp4" }))}\n`);
writeFileSync(join(driftDir, "embeddings.npy"), `${JSON.stringify([normalizedVector(0)])}\n`);
writeFileSync(join(driftDir, "tag_embeddings.npy"), `${JSON.stringify([normalizedVector(0), normalizedVector(1)])}\n`);
const driftCorpus = new Corpus(driftDir);
driftCorpus.load();
ok("corpus load truncates drifted rows to the shortest bank", driftCorpus.length === 1 && driftCorpus.get("two") === null);

const manifest = {
  name: "verify-pipeline",
  reference_input: { supported: true, analysis_tools: ["video_understand"] },
  extensions: { custom_scripts: false, custom_playbooks: true },
  stages: [
    {
      name: "research",
      skill: "skills/research.md",
      review_focus: ["sources"],
      preferred_tools: ["web"],
      fallback_tools: ["offline"],
      sub_stages: [
        { name: "scan", tools_available: ["reader"] },
        { name: "deep", condition: "deep_mode", tools_available: ["clip"] },
      ],
    },
    { name: "proposal", tools_available: ["writer"] },
  ],
};
ok("pipeline manifest helpers expose reference-input config", getReferenceInputConfig(manifest).supported === true && pipelineSupportsReferenceInput(manifest));
ok("pipeline stage order includes active sub-stages when requested",
  JSON.stringify(getStageOrder(manifest, { includeSubStages: true, context: { deep_mode: false } })) === JSON.stringify(["research", "research.scan", "proposal"]));
ok("pipeline stage helpers return sub-stages, skill and review focus",
  getStageSubStages(manifest, "research").length === 2 &&
  getStageSkill(manifest, "research") === "skills/research.md" &&
  getStageReviewFocus(manifest, "research")[0] === "sources");
ok("pipeline required-tools collector spans stages, sub-stages and reference input",
  ["web", "offline", "reader", "clip", "writer", "video_understand"].every((tool) => getRequiredTools(manifest).has(tool)));
let extensionBlocked = false;
try { checkExtensionPermitted(manifest, "custom_scripts"); } catch { extensionBlocked = true; }
ok("pipeline extension guard blocks unpermitted extension types", extensionBlocked);
checkExtensionPermitted(manifest, "custom_playbooks");
ok("pipeline permitted-extension defaults are false", getPermittedExtensions(manifest).custom_tools === false);
ok("checkpoint stage constants match source canonical stages", STAGES.length === 9 && ALL_KNOWN_STAGES.has("scene_plan") && CANONICAL_STAGE_ARTIFACTS.compose === "render_report");
ok("checkpoint stage fallback returns canonical order", getPipelineStages(null).join("|") === STAGES.join("|"));

const checkpointDir = join(process.cwd(), "out", "verify-checkpoints-p3");
try { rmSync(checkpointDir, { recursive: true, force: true }); } catch { /* none */ }
writeCheckpoint(checkpointDir, "project-a", "research", "completed", { research_brief: { summary: "ok" } });
const proposalArtifacts: Record<string, any> = {
  proposal_packet: { production_plan: {} },
  decision_log: { decisions: [{ decision_id: "d1", label: "choose" }] },
};
const proposalPath = writeCheckpoint(checkpointDir, "project-a", "proposal", "completed", proposalArtifacts);
const proposalCheckpoint = readCheckpoint(checkpointDir, "project-a", "proposal");
ok("checkpoint writer emits stage file and validates canonical artifacts", existsSync(proposalPath) && proposalCheckpoint?.stage === "proposal");
ok("checkpoint writer merges decision log refs into proposal packets",
  typeof proposalArtifacts.proposal_packet.production_plan.decision_log_ref === "string" &&
  existsSync(proposalArtifacts.proposal_packet.production_plan.decision_log_ref));
ok("checkpoint readers report completed and next stages", getCompletedStages(checkpointDir, "project-a").join("|") === "research|proposal" && getNextStage(checkpointDir, "project-a") === "idea");
ok("latest checkpoint is chosen by timestamp", getLatestCheckpoint(checkpointDir, "project-a")?.stage === "proposal");
let missingArtifactBlocked = false;
try { validateCheckpoint({ version: "1.0", project_id: "p", pipeline_type: "unknown", stage: "compose", status: "completed", artifacts: {} }); } catch { missingArtifactBlocked = true; }
ok("checkpoint validator blocks completed stages without canonical artifacts", missingArtifactBlocked);

const darkPlaybook = generatePlaybook("Noir Launch", { mood: "dark", tone: "cinematic", pace: "slow", colors: { primary: "#111111", accent: ["#222222"], background: "#000000", text: "#eeeeee" }, fonts: { headings: "Archivo", body: "Source Sans 3" } });
ok("playbook generator creates minimal schema-shaped playbook with mood defaults",
  darkPlaybook.identity.name === "Noir Launch" &&
  darkPlaybook.identity.category === "cinematic" &&
  darkPlaybook.visual_language.color_palette.primary[0] === "#111111" &&
  darkPlaybook.typography.headings.font === "Archivo" &&
  darkPlaybook.asset_generation.consistency_anchors[0] === "dark color palette");
const prompt = buildShotPrompt({
  description: "A tanker crossing the strait at dawn",
  texture_keywords: ["steel hull", "sea mist"],
  shot_language: {
    lens_mm: 35,
    depth_of_field: "shallow",
    shot_size: "wide",
    camera_movement: "dolly_in",
    lighting_key: "golden_hour",
    color_temperature: "warm",
  },
}, { mood: "cinematic", visual_language: { aesthetic: "high contrast documentary" } });
ok("shot prompt builder preserves the 5-layer phrase order",
  prompt === "35mm lens, shallow depth of field with bokeh. wide shot capturing full scene, slow dolly in toward subject. A tanker crossing the strait at dawn. steel hull, sea mist. warm golden hour sunlight, warm amber-toned color palette. Style: high contrast documentary");
const batchPrompts = buildBatchPrompts([{ id: "s1", description: "keep", hero_moment: true }, { id: "t", type: "transition", description: "skip" }]);
ok("batch prompt builder skips transition scenes and carries hero flag", batchPrompts.length === 1 && batchPrompts[0]?.scene_id === "s1" && batchPrompts[0]?.hero_moment === true);

const [cssVars, designMd] = styleBridge({
  id: "pb",
  visual_language: { color_palette: { background: "#101010", text: "#fafafa", accent: ["#ffcc00"], primary: ["#3366ff"], secondary: ["#22cc88"], surface: "#202020", muted_text: "#999999" } },
  typography: { heading: { font: "Sora" }, body: { family: "Inter" }, code: "JetBrains Mono" },
  motion: { pace: "fast" },
}, { metadata: { accent_color: "#ff00ff" } });
ok("style bridge maps playbook palette, fonts and motion to CSS vars",
  cssVars["--color-bg"] === "#101010" &&
  cssVars["--color-accent"] === "#ff00ff" &&
  cssVars["--font-heading"] === "Sora" &&
  cssVars["--duration-entrance"] === "0.4s" &&
  FALLBACK_CSS_VARS["--duration-transition"] === "0.5s");
ok("style bridge renders DESIGN markdown without source-project branding",
  designMd.startsWith("# DESIGN - pb") &&
  designMd.includes("Generated by Montara HyperFrames style bridge"));

console.log("\n== audio TTS connectors (P4) ==");
const ttsText = "the strait of hormuz"; // 20 chars — clean cost rounding
const reg = buildDefaultRegistry();
ok("registry holds all 5 TTS providers + selector",
  Boolean(reg.get("openai_tts") && reg.get("google_tts") && reg.get("piper_tts") && reg.get("doubao_tts") && reg.get("tts_selector")));
ok("getInfo exposes source-faithful snake_case keys", (() => {
  const info = new OpenAITTS().getInfo();
  return "best_for" in info && "agent_skills" in info && "supports" in info && info.execution_mode === "sync";
})());

// OpenAI TTS
const oai = new OpenAITTS();
ok("openai status is key-gated", oai.getStatus({}) === "unavailable" && oai.getStatus({ OPENAI_API_KEY: "k" }) === "available");
ok("openai cost uses char * 0.000015", Math.abs(oai.estimateCost({ text: ttsText }) - 0.0003) < 1e-9);
const oaiReq = oai.buildRequest({ text: ttsText, instructions: "calm" }, "K");
ok("openai request hits /v1/audio/speech with Bearer auth",
  oaiReq.url === "https://api.openai.com/v1/audio/speech" && oaiReq.headers.Authorization === "Bearer K");
ok("openai body carries model/voice/input/response_format + instructions", (() => {
  const b = JSON.parse(oaiReq.body) as Record<string, unknown>;
  return b.model === "gpt-4o-mini-tts" && b.voice === "alloy" && b.input === ttsText && b.response_format === "mp3" && b.instructions === "calm";
})());

// Google TTS
const g = new GoogleTTS();
ok("google status is key-gated on GOOGLE_API_KEY/GEMINI_API_KEY",
  g.getStatus({}) === "unavailable" && g.getStatus({ GEMINI_API_KEY: "k" }) === "available");
ok("google cost table: Chirp3-HD vs Neural2 rates",
  Math.abs(g.estimateCost({ text: ttsText }) - 0.0006) < 1e-9 &&
  Math.abs(g.estimateCost({ text: ttsText, voice: "en-US-Neural2-D" }) - 0.0003) < 1e-9);
const gReq = g.buildRequest({ text: ttsText }, { apiKey: "K" });
ok("google default Chirp voice routes to v1beta1 with ?key=", gReq.url.includes("/v1beta1/text:synthesize?key=K"));
ok("google Neural2 voice routes to v1", g.buildRequest({ text: ttsText, voice: "en-US-Neural2-D" }, { apiKey: "K" }).url.includes("/v1/text:synthesize"));
ok("google body shape matches synthesize payload", (() => {
  const b = JSON.parse(gReq.body) as { input: { text: string }; voice: { languageCode: string; name: string }; audioConfig: { audioEncoding: string } };
  return b.input.text === ttsText && b.voice.languageCode === "en-US" && b.voice.name === "en-US-Chirp3-HD-Orus" && b.audioConfig.audioEncoding === "MP3";
})());

// Piper (local CLI)
const piper = new PiperTTS();
ok("piper is a local cmd:piper tool with zero cost", piper.dependencies[0] === "cmd:piper" && piper.estimateCost({ text: ttsText }) === 0);
const piperCmd = piper.buildCommand({ text: ttsText, model: "en_US-ryan-high" });
ok("piper command shells piper with model + output_file + stdin",
  piperCmd.bin === "piper" && piperCmd.args.includes("--model") && piperCmd.args.includes("en_US-ryan-high") && piperCmd.args.includes("--output_file") && piperCmd.stdin === ttsText);

// Doubao (async submit/poll) — uid scrubbed from the source-project default
const db = new DoubaoTTS();
ok("doubao status is key-gated on DOUBAO_SPEECH_API_KEY", db.getStatus({}) === "unavailable" && db.getStatus({ DOUBAO_SPEECH_API_KEY: "k" }) === "available");
ok("doubao endpoints + format extensions match", DoubaoTTS.SUBMIT_URL.endsWith("/api/v3/tts/submit") && DoubaoTTS.QUERY_URL.endsWith("/api/v3/tts/query") && db.extensionForFormat("ogg_opus") === "ogg");
const dbBody = db.buildSubmitBody({ text: ttsText, sample_rate: 24000, speech_rate: 0 }, "zh_female_01", "req-1");
ok("doubao submit body uses the neutral uid (no source-project name)",
  (dbBody.user as { uid: string }).uid === "montara" && (dbBody.req_params as { speaker: string }).speaker === "zh_female_01");
ok("doubao additions is a JSON string with markdown filter off", (() => {
  const rp = dbBody.req_params as { additions: string; audio_params: { sample_rate: number; enable_timestamp: boolean } };
  const add = JSON.parse(rp.additions) as { disable_markdown_filter: boolean };
  return add.disable_markdown_filter === false && rp.audio_params.sample_rate === 24000 && rp.audio_params.enable_timestamp === true;
})());
const dbHeaders = db.buildHeaders({ apiKey: "K", resourceId: "seed-tts-2.0", requestId: "r1", returnUsage: true });
ok("doubao headers carry X-Api-Key/Resource-Id/Request-Id + usage flag",
  dbHeaders["X-Api-Key"] === "K" && dbHeaders["X-Api-Resource-Id"] === "seed-tts-2.0" && dbHeaders["X-Api-Request-Id"] === "r1" && dbHeaders["X-Control-Require-Usage-Tokens-Return"] === "true");
ok("doubao exposes measured quality/latency metrics in getInfo", db.getInfo().quality_score === 0.88 && db.getInfo().latency_p50_seconds === 8.0);

// TTS selector (discovery + scored ranking via the shared engine)
const sel = new TTSSelector();
ok("selector discovers 6 providers as fallback tools and excludes itself",
  sel.fallbackTools.length === 6 && !sel.fallbackTools.includes("tts_selector"));
ok("selector is ALWAYS available now (zero-key system voice is the floor)",
  sel.getStatus({}) === "available" && sel.getStatus({ OPENAI_API_KEY: "k" }) === "available");
const ranked = await sel.execute({ text: ttsText, operation: "rank" });
const rankings = (ranked.data.rankings ?? []) as { tool_name: string; weighted_score: number }[];
ok("selector rank mode returns all providers scored best-first",
  ranked.success && rankings.length === 6 &&
  rankings.every((r, i) => i === 0 || rankings[i - 1]!.weighted_score >= r.weighted_score) &&
  typeof rankings[0]!.tool_name === "string");

console.log("\n== Python engine bridge (1A.1) ==");
const eInfo = engineInfo();
ok("engine bridge discovers the rooted engine via JSON contract",
  Boolean(eInfo) && eInfo!.ok && eInfo!.missing.length === 0);
ok("engine reports the full tool + lib + pipeline surface",
  Boolean(eInfo) && eInfo!.tools >= 100 && eInfo!.lib >= 15 && eInfo!.pipelines.length >= 10);
const eVerify = engineVerify();
ok("engine integrity smoke AST-parses lib + tools with zero errors",
  Boolean(eVerify) && eVerify!.ok && eVerify!.parsed >= 100 && eVerify!.errors === 0);

console.log("\n== Timeline bridge (1A.2) ==");
const eComp = engineComposition("world-in-numbers");
ok("engine emits a real composition through the bridge", Boolean(eComp) && eComp!.cuts.length === 5);
const bridgedTimeline = eComp ? engineCompositionToTimeline(eComp) : null;
ok("engine composition compiles to a VALID Montara Timeline IR (no parallel format)",
  Boolean(bridgedTimeline) && validateTimeline(bridgedTimeline!).length === 0);
ok("bridged IR preserves cut count + duration on the one IR",
  Boolean(bridgedTimeline) &&
  bridgedTimeline!.tracks.find((t) => t.type === "video")!.clips.length === 5 &&
  bridgedTimeline!.composition.durationSec > 0);
ok("Timeline IR round-trips back to engine cuts (start/end preserved)", (() => {
  if (!eComp || !bridgedTimeline) return false;
  const back = timelineToEngineComposition(bridgedTimeline);
  if (back.cuts.length !== eComp.cuts.length) return false;
  const a = [...eComp.cuts].sort((x, y) => x.in_seconds - y.in_seconds);
  return back.cuts.every((c, i) =>
    Math.abs(c.in_seconds - a[i]!.in_seconds) < 1e-6 && Math.abs(c.out_seconds - a[i]!.out_seconds) < 1e-6);
})());

console.log("\n== Provider/runtime bridge (1A.4) ==");
const noKey = engineProviders();
ok("engine discovers its provider surface dependency-free (no imports)",
  Boolean(noKey) && noKey!.total >= 70 && noKey!.local > 0);
const elevenNoKey = noKey?.providers.find((p) => p.name === "elevenlabs_tts");
ok("no-key offline path: keyed providers are simply unconfigured, never crash",
  Boolean(elevenNoKey) && elevenNoKey!.configured === false && elevenNoKey!.auth_env === "ELEVENLABS_API_KEY");
const savedKey = process.env.ELEVENLABS_API_KEY;
process.env.ELEVENLABS_API_KEY = "verify-fake-key";
const keyed = engineProviders();
if (savedKey == null) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = savedKey;
ok("keyed providers activate only when their env var is configured (secret-safe boolean)",
  keyed?.providers.find((p) => p.name === "elevenlabs_tts")?.configured === true);
ok("provider discovery never leaks secret values (env name only, boolean status)",
  Boolean(noKey) && noKey!.providers.every((p) => typeof p.configured === "boolean" && (p.auth_env === null || /^[A-Z][A-Z0-9_]+$/.test(p.auth_env))));

console.log("\n== Engine test parity (1A.5) ==");
const selfcheck = engineSelfcheck();
ok("engine self-check battery passes inside the Montara gate", Boolean(selfcheck) && selfcheck!.ok && selfcheck!.passed === selfcheck!.total);
for (const c of selfcheck?.checks ?? []) ok(`engine check — ${c.name}`, c.ok, c.detail);

console.log("\n== Compliance gate (1A.6) ==");
const compliance = engineCompliance();
ok("no legacy source-project branding in committable source", Boolean(compliance) && compliance!.legacy_tokens.length === 0);
ok("no hardcoded secrets in committable source", Boolean(compliance) && compliance!.hardcoded_secrets.length === 0);
ok("compliance scan covers the whole source tree", Boolean(compliance) && compliance!.ok && compliance!.scanned > 300, `scanned ${compliance?.scanned ?? 0}`);

console.log("\n== Voice-ID hear engine (2.4) ==");
ok("voice-ID availability is a boolean (degrade-friendly), never throws", typeof voiceIdAvailable() === "boolean");
ok("voice_id.py speaker-embedding tool ships in the repo", existsSync(join(process.cwd(), "voice_id.py")));
const speakerStatus = speakerIntelligenceStatus();
ok("speaker intelligence reports Resemblyzer/SpeechBrain/pyannote availability as booleans",
  typeof speakerStatus.resemblyzer === "boolean" &&
  typeof speakerStatus.speechbrainEcapa === "boolean" &&
  typeof speakerStatus.pyannote === "boolean");
const dialogueMatches = findDialogueByVoice({
  queryAudioPath: join(process.cwd(), "out", "missing-query.wav"),
  requestedLine: "picture abhi baaki hai mere dost",
  corpus: [
    { id: "srk-1", speaker: "Shah Rukh Khan", path: join(process.cwd(), "out", "missing-srk.wav"), line: "Picture abhi baaki hai mere dost" },
    { id: "other-1", speaker: "Other", path: join(process.cwd(), "out", "missing-other.wav"), line: "This is a totally different line" },
  ],
});
ok("dialogue search degrades to line-aware ranking when voice embeddings are unavailable",
  dialogueMatches[0]?.clip.id === "srk-1" && dialogueMatches[0]!.lineScore > dialogueMatches[1]!.lineScore);

console.log("\n== Render runtimes — Blender (2.3) ==");
ok("blender availability is a boolean (degrade-friendly), never throws", typeof blenderAvailable() === "boolean");
ok("blender scene script ships in the repo", existsSync(join(process.cwd(), "blender", "montara_intro.py")));
ok("blenderBin resolves a concrete binary when installed", blenderAvailable() ? typeof blenderBin() === "string" && blenderBin()!.length > 0 : blenderBin() === null);

console.log("\n== Local generation runtimes (5.1) ==");
const localRuntimes = listRuntimes();
ok("runtime registry includes ComfyUI and A1111 without bundling them", (() => {
  const ids = localRuntimes.map((runtime) => runtime.id);
  return ids.includes("comfyui") &&
    ids.includes("a1111") &&
    localRuntimes.every((runtime) => /External runtime/.test(runtime.licenseBoundary));
})());
ok("runtime env hints map local APIs to provider env vars", (() => {
  const hints = runtimeEnvHints({ COMFYUI_URL: "http://127.0.0.1:8188", A1111_URL: "http://127.0.0.1:7860" });
  return hints.comfyui === "http://127.0.0.1:8188" && hints.a1111 === "http://127.0.0.1:7860";
})());
ok("runtime install plans are guidance-only and keep setup external", (() => {
  const comfy = runtimeInstallPlan("comfyui").join(" ");
  const a1111 = runtimeInstallPlan("a1111").join(" ");
  return comfy.includes("Install ComfyUI externally") && a1111.includes("Install AUTOMATIC1111 externally");
})());
const runtimeNoProbe = await runtimeStatusReport({ probe: false, env: {} });
ok("runtime status report degrades without probing or configured env", runtimeNoProbe.summary.total === 2 && runtimeNoProbe.summary.missing === 2 && runtimeNoProbe.runtimes.every((runtime) => runtime.status === "not-configured"));
const runtimeRoot = join(process.cwd(), "out", "verify-runtimes");
const comfyInstall = managedRuntimePlan("comfyui", "install", { rootDir: runtimeRoot, platform: "win32" });
ok("managed ComfyUI install plan clones outside repo and prepares requirements", comfyInstall.runtimeDir.startsWith(runtimeRoot) && comfyInstall.commands.some((cmd) => cmd.command === "git" && cmd.args.includes("https://github.com/comfyanonymous/ComfyUI.git")) && comfyInstall.commands.some((cmd) => cmd.args.includes("requirements.txt")));
const a1111Launch = managedRuntimePlan("a1111", "launch", { rootDir: runtimeRoot, platform: "win32" });
ok("managed A1111 launch plan enables API mode on the expected port", a1111Launch.commands.some((cmd) => cmd.args.includes("--api") && cmd.args.includes("7860")));
const runtimeDryRoot = join(process.cwd(), "out", "verify-runtimes-dry-run");
try { rmSync(runtimeDryRoot, { recursive: true, force: true }); } catch { /* none */ }
const runtimeDryInstall = installRuntime("comfyui", { rootDir: runtimeDryRoot, execute: false });
const runtimeDryLaunch = launchRuntime("a1111", { rootDir: runtimeDryRoot, execute: false });
ok("managed runtime install/launch default to dry-run unless explicitly executed", runtimeDryInstall.ok && !runtimeDryInstall.executed && runtimeDryLaunch.ok && !runtimeDryLaunch.executed && !existsSync(runtimeDryRoot));
const runtimeEnvPath = join(process.cwd(), "out", "verify-runtimes.env");
writeRuntimeEnv(comfyInstall, runtimeEnvPath);
ok("runtime manager writes env hints for downstream provider configuration", existsSync(runtimeEnvPath) && readFileSync(runtimeEnvPath, "utf8").includes("COMFYUI_URL="));

console.log("\n== System (zero-key) TTS (2.2) ==");
const sysReg = buildDefaultRegistry();
ok("registry includes the system TTS fallback", Boolean(sysReg.get("system_tts")));
const sys = new SystemTTS();
ok("system TTS is local, offline, zero-cost", sys.runtime === "local" && sys.supports.offline === true && sys.estimateCost({ text: "hi" }) === 0);
const winCmd = sys.buildCommand({ text: "he's here", rate: 2 }, "win32");
ok("Windows SAPI command writes a wav via System.Speech with escaped text",
  winCmd.bin === "powershell" && winCmd.args.join(" ").includes("System.Speech") &&
  winCmd.args.join(" ").includes("SetOutputToWaveFile") && winCmd.args.join(" ").includes("he''s here"));
const macCmd = sys.buildCommand({ text: "hello" }, "darwin");
ok("macOS uses `say` to a WAVE file", macCmd.bin === "say" && macCmd.args.includes("--file-format=WAVE"));
ok("system TTS reports available on this OS (keeps zero-key narration true)",
  process.platform !== "win32" || sys.getStatus() === "available");
ok("selector lists system TTS as an always-on fallback", new TTSSelector().fallbackTools.includes("system_tts"));

console.log("\n== Editable Timeline IR (2.1) ==");
const editBase = scenePlanToTimeline({
  width: 1280, height: 720, fps: 30,
  scenes: [
    { id: "a", title: "Alpha", durationSec: 2, background: "101820" },
    { id: "b", title: "Beta", durationSec: 2, background: "214f4b" },
    { id: "c", title: "Gamma", durationSec: 2, background: "7c3f58" },
  ],
});
ok("base IR is valid (6s, 2 tracks)", validateTimeline(editBase).length === 0 && editBase.composition.durationSec === 6);

const split = splitClip(editBase, "a-solid", 1);
ok("splitClip cuts one clip into two, IR stays valid", (() => {
  const vid = split.tracks.find((t) => t.type === "video")!;
  return validateTimeline(split).length === 0 && vid.clips.length === 4 &&
    Boolean(findClip(split, "a-solid-a")) && Boolean(findClip(split, "a-solid-b"));
})());

const trimmed = trimClip(editBase, "b-solid", { durationSec: 5 });
ok("trimClip retimes a clip and recomputes composition duration",
  validateTimeline(trimmed).length === 0 && findClip(trimmed, "b-solid")!.clip.durationSec === 5);

const moved = moveClip(editBase, "c-solid", 0.5);
ok("moveClip repositions a clip (clamped >= 0), IR stays valid",
  validateTimeline(moved).length === 0 && findClip(moved, "c-solid")!.clip.startSec === 0.5);

const removed = removeClip(editBase, "b-solid");
ok("removeClip drops a clip, IR stays valid",
  validateTimeline(removed).length === 0 && findClip(removed, "b-solid") === null);

const recolored = recolorClip(editBase, "a-solid", "#FF8800");
ok("recolorClip recolors a solid clip (hex normalized)", (() => {
  const c = findClip(recolored, "a-solid")!.clip;
  return c.type === "video" && c.source.kind === "solid" && c.source.color === "ff8800";
})());

const retext = setClipText(editBase, "a-title", "Edited");
ok("setClipText edits a text clip", findClip(retext, "a-title")!.clip.type === "text" && (findClip(retext, "a-title")!.clip as { text: string }).text === "Edited");

ok("edit ops are immutable (original IR untouched)",
  editBase.tracks.find((t) => t.type === "video")!.clips.length === 3 && editBase.composition.durationSec === 6);

// ---- 2.5 Pro editing IR: layers, transform, mask, effects, PiP, collage ----
const tf = setTransform(editBase, "a-solid", { x: 100, y: 50, scale: 0.4, opacity: 0.8 });
ok("setTransform merges a partial transform, IR stays valid", (() => {
  const c = findClip(tf, "a-solid")!.clip;
  return validateTimeline(tf).length === 0 && c.transform?.x === 100 && c.transform?.scale === 0.4 && c.transform?.opacity === 0.8;
})());

const masked = setMask(editBase, "a-solid", { shape: "ellipse", feather: 0.05 });
ok("setMask attaches an ellipse mask; clearing removes it", (() => {
  const withMask = findClip(masked, "a-solid")!.clip.mask?.shape === "ellipse";
  const cleared = setMask(masked, "a-solid", null);
  return withMask && findClip(cleared, "a-solid")!.clip.mask === undefined && validateTimeline(masked).length === 0;
})());

const fx = addEffect(addEffect(editBase, "a-solid", { type: "blur", amount: 0.3 }), "a-solid", { type: "saturation", amount: 1.4 });
ok("addEffect appends an ordered effect chain", (() => {
  const e = findClip(fx, "a-solid")!.clip.effects ?? [];
  return e.length === 2 && e[0]!.type === "blur" && e[1]!.type === "saturation";
})());

const cropped = setCrop(editBase, "a-solid", { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
ok("setCrop sets a normalized source crop", findClip(cropped, "a-solid")!.clip.crop?.w === 0.8);

const zed = setZ(setZ(editBase, "a-solid", 5), "b-solid", 1);
ok("setZ sets explicit stacking order", findClip(zed, "a-solid")!.clip.z === 5 && findClip(zed, "b-solid")!.clip.z === 1);

const pip = pipTimeline({
  width: 1280, height: 720, fps: 30, durationSec: 4,
  base: { path: "base.mp4", kind: "video" }, inset: { path: "cam.mp4", kind: "video" },
  corner: "br", insetScale: 0.3, insetMask: { shape: "ellipse" },
});
ok("pictureInPicture builds a valid 2-layer timeline with a masked inset", (() => {
  const insetTrack = pip.tracks.find((t) => t.id === "video-pip")!;
  const inset = insetTrack.clips[0]!;
  return validateTimeline(pip).length === 0 && pip.tracks.length === 2 &&
    isMediaClip(inset) && inset.mask?.shape === "ellipse" && (inset.transform?.scale ?? 0) === 0.3 && (inset.z ?? 0) === 10;
})());

const col = collageTimeline({
  width: 1280, height: 720, fps: 30, durationSec: 4,
  cells: [{ path: "a.mp4" }, { path: "b.mp4" }, { path: "c.mp4" }, { path: "d.mp4" }], cols: 2, rows: 2,
});
ok("collage tiles N media clips into an exact grid (cover-cropped boxes)", (() => {
  const clips = col.tracks[0]!.clips;
  return validateTimeline(col).length === 0 && clips.length === 4 &&
    clips.every((c) => isMediaClip(c) && Boolean(c.box)) &&
    Math.abs((clips[0]!.box!.wFrac) - 0.49) < 0.05;
})());

ok("media-path validation rejects an empty media source", (() => {
  const bad = pipTimeline({ width: 640, height: 360, fps: 24, durationSec: 1, base: { path: "" }, inset: { path: "x.mp4" } });
  return validateTimeline(bad).some((i) => i.includes("requires source.path"));
})());

// ---- Voice director: emotion + music -> voice choice + dynamic volume ----
const urgent = directScene({ emotion: "urgent", intensity: 0.9, musicEnergy: 0.7 }, ["elevenlabs", "openai", "system"]);
ok("voice director picks an expressive provider for a high-intensity beat", urgent.provider === "elevenlabs" && urgent.rate > 1.05);
ok("voice director ducks loud music and lifts the voice", urgent.musicDuckDb < 0 && urgent.gainDb > 0);

const calm = directScene({ emotion: "calm", intensity: 0.2, musicEnergy: 0 }, ["system"]);
ok("voice director slows/quiets a calm beat and falls back to the system voice", calm.rate < 1 && calm.gainDb <= 0 && calm.provider === "system");

ok("voice director infers emotion from text keywords", resolveEmotion({ text: "Breaking: the attack is happening now" }) === "urgent");
ok("voice director always returns a usable plan with zero keys", (() => {
  const plan = directScript([{ emotion: "warm" }, { text: "a victory for the team" }], []);
  return plan.length === 2 && plan.every((d) => d.provider === "system") && plan[1]!.emotion === "triumphant";
})());

// ---- Auto engine picker: pick the best INSTALLED renderer per scene type ----
ok("recommendEngine maps a 3D title to the three.js engine", recommendEngine("title-3d").preferred === "three");
ok("recommendEngine maps math to Manim, kinetic to Motion Canvas, MIT explainer to Revideo", (() => {
  return recommendEngine("math").preferred === "manim" &&
    recommendEngine("kinetic-typography").preferred === "motion-canvas" &&
    recommendEngine("explainer-mit").preferred === "revideo";
})());
ok("recommendEngine picks native when installed, else degrades to ffmpeg", (() => {
  const rec = recommendEngine("title-3d");
  return rec.engine === (threeAvailable() ? "three" : "ffmpeg") && rec.native === (rec.engine !== "ffmpeg");
})());
ok("recommendEngine always resolves assembly to ffmpeg (the universal floor)", (() => {
  const rec = recommendEngine("assembly");
  return rec.engine === "ffmpeg" && rec.native === false;
})());
ok("recommendEngine degrades an unknown scene type to ffmpeg", recommendEngine("totally-made-up-type").engine === "ffmpeg");
ok("availableEngines marks ffmpeg always-available and reports stable boolean states", (() => {
  const list = availableEngines();
  const ff = list.find((e) => e.engine.id === "ffmpeg")!;
  return ff.available === true && ff.native === false && list.every((e) => typeof e.available === "boolean" && typeof e.native === "boolean");
})());

// ---- Pro-editor bridges: export the IR to EDL / FCPXML / OTIO ----
const bridgeTl = pipTimeline({
  width: 1920, height: 1080, fps: 30, durationSec: 6,
  base: { path: "C:/clips/base.mp4", kind: "video" }, inset: { path: "C:/clips/cam.mp4", kind: "video" }, corner: "br",
});

ok("timecode is non-drop SMPTE (90 frames @ 30fps = 00:00:03:00)", framesToTimecode(90, 30) === "00:00:03:00");

const edl = timelineToEDL(bridgeTl, { title: "test" });
ok("EDL is CMX3600 with a title, FCM, and one event per video clip", (() => {
  return edl.includes("TITLE: TEST") && edl.includes("FCM: NON-DROP FRAME") &&
    edl.includes("001  ") && /\d\d:\d\d:\d\d:\d\d \d\d:\d\d:\d\d:\d\d/.test(edl) && edl.includes("FROM CLIP NAME: base.mp4");
})());

const otioStr = timelineToOTIO(bridgeTl, { title: "t" });
ok("OTIO is valid JSON with the OTIO Timeline schema and tracks", (() => {
  const o = JSON.parse(otioStr) as { OTIO_SCHEMA: string; tracks: { children: { children: { OTIO_SCHEMA: string }[] }[] } };
  const firstTrackKids = o.tracks.children[0]!.children;
  return o.OTIO_SCHEMA === "Timeline.1" && firstTrackKids.some((c) => c.OTIO_SCHEMA === "Clip.1");
})());

const fcp = timelineToFCPXML(bridgeTl, { title: "t" });
ok("FCPXML 1.10 has resources, a spine, and an asset-clip for media", (() => {
  return fcp.includes('<fcpxml version="1.10">') && fcp.includes("<spine>") && fcp.includes("<asset-clip ") && fcp.includes('src="file://C:/clips/base.mp4"');
})());

ok("exportTimeline dispatches all three formats with sensible extensions", (() => {
  return exportTimeline(bridgeTl, "edl").ext === "edl" &&
    exportTimeline(bridgeTl, "fcpxml").ext === "fcpxml" &&
    exportTimeline(bridgeTl, "otio").ext === "otio" &&
    exportTimeline(bridgeTl, "otio").content.includes("OTIO_SCHEMA");
})());

// ---- Pro-editor IMPORT (M3 / 3.2): round-trip a cut BACK into valid Timeline IR ----
const sourceVideoClips = videoClips(bridgeTl).length;
ok("detectEditorFormat sniffs edl/otio/fcpxml from contents",
  detectEditorFormat(edl) === "edl" && detectEditorFormat(otioStr) === "otio" && detectEditorFormat(fcp) === "fcpxml");

const fcpImport = fcpxmlToTimeline(fcp);
ok("FCPXML imports back into a VALID Timeline IR preserving comp dims, fps and media clips", (() => {
  return validateTimeline(fcpImport).length === 0 &&
    fcpImport.composition.width === 1920 && fcpImport.composition.height === 1080 && fcpImport.composition.fps === 30 &&
    videoClips(fcpImport).length === sourceVideoClips &&
    videoClips(fcpImport).some((c) => (c as { source: { path: string } }).source.path === "C:/clips/base.mp4");
})());

const shuffledFcp = `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.10">
  <resources>
    <format width="1920" id="fmt1" height="1080" frameDuration="1/30s"/>
    <asset src="file://C:/clips/shuffled.mp4" duration="180/30s" id="asset1"/>
  </resources>
  <library><event name="Montara"><project name="t"><sequence format="fmt1" duration="90/30s"><spine>
    <asset-clip duration="90/30s" start="30/30s" offset="15/30s" ref="asset1"/>
    <gap duration="30/30s" offset="120/30s"><title name="Order-insensitive title"/></gap>
  </spine></sequence></project></event></library>
</fcpxml>`;
const shuffledFcpImport = fcpxmlToTimeline(shuffledFcp);
ok("FCPXML import is order-insensitive for format, asset, asset-clip and gap attributes", (() => {
  const clips = videoClips(shuffledFcpImport);
  const first = clips[0] as { startSec: number; durationSec: number; sourceInSec?: number; source: { path: string } } | undefined;
  const textClips = shuffledFcpImport.tracks.flatMap((t) => t.type === "text" ? t.clips : []) as Array<{ text: string; startSec: number; durationSec: number }>;
  return validateTimeline(shuffledFcpImport).length === 0 &&
    shuffledFcpImport.composition.fps === 30 &&
    Boolean(first) && first!.source.path === "C:/clips/shuffled.mp4" &&
    Math.abs(first!.startSec - 0.5) < 0.01 && Math.abs(first!.durationSec - 3) < 0.01 &&
    Math.abs((first!.sourceInSec ?? 0) - 1) < 0.01 &&
    textClips.some((c) => c.text === "Order-insensitive title" && Math.abs(c.startSec - 4) < 0.01);
})());

const otioImport = otioToTimeline(otioStr);
ok("OTIO imports back into a VALID Timeline IR preserving fps, clip count and media paths", (() => {
  return validateTimeline(otioImport).length === 0 &&
    otioImport.composition.fps === 30 &&
    videoClips(otioImport).length === sourceVideoClips &&
    videoClips(otioImport).some((c) => (c as { source: { path: string } }).source.path === "C:/clips/base.mp4");
})());

const edlImport = edlToTimeline(edl);
ok("EDL imports back into a VALID Timeline IR with one clip per cut event and SMPTE-derived timing", (() => {
  const clips = videoClips(edlImport);
  const first = clips[0] as { startSec: number; durationSec: number } | undefined;
  return validateTimeline(edlImport).length === 0 &&
    clips.length === sourceVideoClips &&
    Boolean(first) && Math.abs((first!.startSec + first!.durationSec) - 6) < 0.05;
})());

ok("importTimeline dispatches all three formats to valid IR", (() => {
  return validateTimeline(importTimeline(edl, "edl")).length === 0 &&
    validateTimeline(importTimeline(otioStr, "otio")).length === 0 &&
    validateTimeline(importTimeline(fcp, "fcpxml")).length === 0;
})());

// ---- Local-LLM brain (Ollama / LM Studio / llama.cpp) ----
ok("brain catalogues the three local backends (zero-key, offline)", (() => {
  const ids = brainCatalogue().map((b) => b.id);
  return ids.length === 3 && ids.includes("ollama") && ids.includes("lmstudio") && ids.includes("llamacpp");
})());
ok("brain backends carry a base URL and a kind", brainCatalogue().every((b) => b.baseUrl.startsWith("http") && (b.kind === "ollama" || b.kind === "openai-compatible")));
ok("ollamaInstalled() is a boolean probe (never throws)", typeof ollamaInstalled() === "boolean");

// ---- Find-skills: search the real skills library ----
ok("listSkills() discovers the skills library with titles", (() => {
  const all = listSkills();
  return all.length > 20 && all.every((s) => s.id.endsWith(".md") && s.title.length > 0) && all.some((s) => s.id.startsWith("editing/"));
})());
ok("findSkills ranks the masking doc top for a mask query", (() => {
  const hits = findSkills("mask circular webcam ellipse");
  return hits.length > 0 && hits[0]!.id.includes("masks");
})());
ok("findSkills surfaces the craft doc for a loudness query", (() => {
  const hits = findSkills("master loudness lufs");
  return hits.some((s) => s.id.includes("craft"));
})());
ok("findSkills surfaces native render validation for runtime QA", (() => {
  const hits = findSkills("native render validation remotion three blender");
  return hits.some((s) => s.id === "core/native-render-validation.md");
})());
ok("findSkills surfaces provider audit for live BYOK checks", (() => {
  const hits = findSkills("provider audit live byok redacted fixture");
  return hits.some((s) => s.id === "core/provider-audit.md");
})());
ok("public launch plan ties community claims to reproducible proof artifacts", (() => {
  const doc = readFileSync(join(process.cwd(), "docs", "LAUNCH-PLAN.md"), "utf8");
  return doc.includes("out/validate-compose-core.mp4") &&
    doc.includes("out/validate-smart-reel.mp4") &&
    doc.includes("runtime-gated") &&
    doc.includes("docs/PROVIDER-AUDIT.md") &&
    doc.includes("Create five short videos");
})());

const reelPlan = planReelTreatment({
  understanding: { durationSec: 12, sceneCount: 1, tags: ["bright", "muted", "slow-cut"] },
  captions: [{ startSec: 0.4, endSec: 2.8, text: "AI employees are not a single prompt" }],
  skills: findSkills("reel source media understand captions edit music voice mask").map((s) => ({ id: s.id, title: s.title, summary: s.summary })),
  availableVoiceProviders: ["system"],
  ttsProviders: [LOCAL_TTS_FALLBACK],
  musicProviders: [LOCAL_MUSIC_FALLBACK],
  capabilities: { localStt: true, voiceId: false, aiHumanMask: false, localBrain: false },
});
ok("planReelTreatment creates a source-aware reel plan with skills/tools/providers", (() => {
  return reelPlan.beats.length >= 1 &&
    reelPlan.visualDirectives.some((d) => d.kind === "source-primary") &&
    reelPlan.selectedSkills.length > 0 &&
    reelPlan.selectedTools.includes("planReelTreatment") &&
    reelPlan.ttsDecision.mode === "skip" &&
    reelPlan.musicDecision.mode === "skip" &&
    reelPlan.maskingDecision.id === "safe-zone-overlays";
})());

const fablePlan = planReelTreatment({
  understanding: { durationSec: 24, sceneCount: 1, tags: ["slow-cut", "vertical", "speech-capable"], caption: "talking head source" },
  captions: [
    { startSec: 1, endSec: 4, text: "Fable 5 needs player choice that changes quests and progression" },
    { startSec: 9, endSec: 12, text: "The interface should make consequences readable before combat starts" },
  ],
  skills: findSkills("reel game design talking head overlays").map((s) => ({ id: s.id, title: s.title, summary: s.summary })),
  availableVoiceProviders: ["system"],
  ttsProviders: [LOCAL_TTS_FALLBACK],
  musicProviders: [LOCAL_MUSIC_FALLBACK],
  capabilities: { localStt: true, voiceId: false, aiHumanMask: false, localBrain: false },
  prompt: "Make a reel about explaining the design of Fable 5 using this talking-head footage",
});
ok("Fable 5 talking-head prompt creates topic-specific game-design directives",
  fablePlan.inputKind === "talking-head" &&
  fablePlan.style === "smart-talking-head" &&
  fablePlan.visualDirectives.some((d) => d.title === "PROGRESSION LOOP") &&
  fablePlan.visualDirectives.some((d) => d.kind === "ui-mock") &&
  fablePlan.editIntent.some((line) => line.includes("game-design visualizations")) &&
  fablePlan.cta === "");

const cinematicPlan = planReelTreatment({
  understanding: { durationSec: 18, sceneCount: 4, tags: ["fast-cut"] },
  captions: [],
  skills: [],
  availableVoiceProviders: ["system"],
  ttsProviders: [LOCAL_TTS_FALLBACK],
  musicProviders: [LOCAL_MUSIC_FALLBACK],
  capabilities: { localStt: false, voiceId: false, aiHumanMask: false, localBrain: false },
  prompt: "cinematic reel about the same design idea",
});
const minimalPlan = planReelTreatment({
  understanding: { durationSec: 18, sceneCount: 4, tags: ["fast-cut"] },
  captions: [],
  skills: [],
  availableVoiceProviders: ["system"],
  ttsProviders: [LOCAL_TTS_FALLBACK],
  musicProviders: [LOCAL_MUSIC_FALLBACK],
  capabilities: { localStt: false, voiceId: false, aiHumanMask: false, localBrain: false },
  prompt: "minimal reel about the same design idea",
});
const warfrontPlan = planReelTreatment({
  understanding: { durationSec: 18, sceneCount: 4, tags: ["fast-cut"] },
  captions: [],
  skills: [],
  availableVoiceProviders: ["system"],
  ttsProviders: [LOCAL_TTS_FALLBACK],
  musicProviders: [LOCAL_MUSIC_FALLBACK],
  capabilities: { localStt: false, voiceId: false, aiHumanMask: false, localBrain: false },
  prompt: "Warfront-style documentary reel with evidence and maps",
});
ok("requested reel styles produce distinct visual/timing treatments",
  cinematicPlan.style === "cinematic" &&
  minimalPlan.style === "minimal" &&
  warfrontPlan.style === "warfront-documentary" &&
  minimalPlan.timing.endCardDurationSec === 0 &&
  warfrontPlan.visualDirectives.some((d) => d.kind === "map-or-data") &&
  cinematicPlan.renderStyle.accent !== minimalPlan.renderStyle.accent);

const reelArtifacts = createReelArtifacts({
  inputPath: "source-talking-head.mp4",
  understanding: { durationSec: 24, sceneCount: 1, tags: ["vertical", "slow-cut"] },
  plan: fablePlan,
  captions: [{ startSec: 1, endSec: 2.5, text: "choice needs readable stakes" }],
});
ok("content-aware reel plan emits editable Timeline IR plus edit_decisions",
  validateTimeline(reelArtifacts.timeline).length === 0 &&
  reelArtifacts.timeline.metadata?.reel_style === "smart-talking-head" &&
  Array.isArray(reelArtifacts.timeline.metadata?.visual_directives) &&
  reelArtifacts.editDecisions.render_runtime === "ffmpeg" &&
  reelArtifacts.editDecisions.metadata?.visual_directives instanceof Array &&
  reelArtifacts.editDecisions.cuts.length >= 1);

const reelHardcodeFiles = [
  join(process.cwd(), "packages", "render-ffmpeg", "src", "reel.ts"),
  join(process.cwd(), "packages", "quality", "src", "reelPlanner.ts"),
  join(process.cwd(), "packages", "quality", "src", "reelArtifacts.ts"),
  join(process.cwd(), "packages", "cli", "src", "index.ts"),
];
const reelHardcodeText = reelHardcodeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
ok("reel path has no baked hooks or fixed ffmpeg layout/timing policy",
  !/WATCH THE TURN|ONE TAKE, SHARPER EDIT|WATCH THE CUT|WATCH THE POINT BUILD|THIS ISN'T ONE PROMPT|dynamicWindow|capY|capSize|wrapAt|fontFamily: "Arial"|follow warfront|warfront\.live/.test(reelHardcodeText) &&
  !/H \* 0\.[0-9]+|W \* 0\.[0-9]+|between\(t,[^)]+\)/.test(readFileSync(join(process.cwd(), "packages", "render-ffmpeg", "src", "reel.ts"), "utf8")));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
