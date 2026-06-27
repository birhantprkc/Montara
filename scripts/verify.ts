// Montara verify harness. Contract tests for core + render-ffmpeg, including real MP4 renders.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  scenePlanToTimeline,
  timelineDuration,
  totalDuration,
  round3,
  validateTimeline,
  type ScenePlan,
} from "../packages/core/src/index";
import { renderScenePlan, renderTimeline, probeDuration } from "../packages/render-ffmpeg/src/index";
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
  planImageGeneration,
  runImageGeneration,
} from "../packages/providers/src/index";
import {
  DecisionTrail,
  SELECTION_WEIGHTS,
  selectProviderTool,
  selectMediaProvider,
  slideshowRisk,
  preComposeGate,
  BudgetLedger,
} from "../packages/quality/src/index";
import { planResearchQueries, runResearch, indexFootage, retrieveFootage } from "../packages/research/src/index";
import { getPipeline, PIPELINE_DEFS } from "../packages/ai/src/index";
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
  renderAssistantConfig,
  ASSISTANT_TARGETS,
  SKILLS_ENTRY,
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
ok("DALL·E request is a Bearer POST with model + prompt", dalleReq.method === "POST" && dalleReq.headers.Authorization === "Bearer ok" && Boolean(dalleReq.body?.includes("dall-e-3")));
const unsplashReq = buildImageRequest(getImageProvider("unsplash")!, iInput, { UNSPLASH_ACCESS_KEY: "uk" });
ok("Unsplash request is a GET with Client-ID auth", unsplashReq.method === "GET" && unsplashReq.headers.Authorization === "Client-ID uk");

const offlineImg = planImageGeneration(iInput, {});
ok("with no credentials an image plan falls back to local-free", offlineImg.mode === "fallback" && offlineImg.provider.tier === "local-free");
const keyedImg = planImageGeneration({ ...iInput, providerId: "flux" }, { BFL_API_KEY: "bk" });
ok("a credentialed image provider yields a request plan", keyedImg.mode === "request" && keyedImg.provider.id === "flux");

const iGen = runImageGeneration(iInput, {});
ok("offline image generation writes a real fallback PNG", Boolean(iGen.result) && existsSync(iInput.outPath));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
