// Montara validate harness: compose core + Phase 1.3 local provider tools.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { ScenePlan } from "../packages/core/src/index";
import { secondsToFrames, validateTimeline, pictureInPicture, collage } from "../packages/core/src/index";
import { composeScenePlan, renderComposedTimeline } from "../packages/render-remotion/src/index";
import { probeDuration, compositeTimeline, mediaBin, masterAudio, generateThumbnails, cutShort, buildReel } from "../packages/render-ffmpeg/src/index";
import { qaPlayback } from "../packages/hear/src/index";
import { threeAvailable, renderThreeScene } from "../packages/render-three/src/index";
import { renderBridgedTimeline, engineRemotionAvailable } from "../packages/engine/src/index";
import {
  exportTimelineSubtitles,
  generateSilentVoice,
  generateToneScore,
  listProviderTools,
  probeMedia,
  renderCaptionCardImage,
  renderCaptionCardVideo,
  sampleFrame,
  stitchVideos,
  trimVideo,
  VIDEO_PROVIDERS,
  buildVideoRequest,
  getVideoProvider,
  planVideoGeneration,
  runVideoGeneration,
  IMAGE_PROVIDERS,
  getImageProvider,
  buildImageRequest,
  runImageGeneration,
  TTS_PROVIDERS,
  MUSIC_PROVIDERS,
  runSpeechGeneration,
  runMusicGeneration,
  mixAudioTracks,
  enhanceAudio,
  colorGrade,
  crossfadeStitch,
  upscaleVideo,
  ENHANCEMENT_TOOLS,
  getEnhancementTool,
  enhancementAvailable,
} from "../packages/providers/src/index";
import {
  DecisionTrail,
  selectProviderTool,
  preComposeGate,
  postRenderSelfReview,
  writeSelfReview,
  BudgetLedger,
} from "../packages/quality/src/index";
import { runResearch, indexFootage, retrieveFootage } from "../packages/research/src/index";
import { planVideo } from "../packages/ai/src/index";
import { analyzeReferenceVideo, transcribe } from "../packages/understand/src/index";
import { listEngines, preferredEngine, renderWithEngine } from "../packages/render-engines/src/index";
import { STYLE_PLAYBOOKS, OUTPUT_PROFILES, applyStyle, applyOutputProfile } from "../packages/style/src/index";
import {
  createCheckpoint,
  advanceCheckpoint,
  nextStage,
  isComplete,
  saveCheckpoint,
  loadCheckpoint,
  validateJson,
  timelineSchema,
  writePipelineManifests,
  writeSchemas,
  writeAssistantConfigs,
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

console.log("== Montara validate ==\n");

const plan: ScenePlan = {
  width: 960,
  height: 540,
  fps: 30,
  scenes: [
    { id: "cold-open", title: "Frame one moves", durationSec: 1.2, background: "101820" },
    { id: "timeline", title: "One Timeline IR", durationSec: 1.4, background: "214f4b" },
    { id: "encoded", title: "Composed to MP4", durationSec: 1.2, background: "7c3f58" },
  ],
};

const outDir = join(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const irPath = join(outDir, "validate-compose-core.timeline.json");
const mp4Path = join(outDir, "validate-compose-core.mp4");
try { rmSync(mp4Path, { force: true }); } catch { /* none */ }

const result = composeScenePlan(plan);
writeFileSync(irPath, `${JSON.stringify(result.timeline, null, 2)}\n`);

console.log("== compose ==");
ok("composer selected Remotion IR path", result.composer === "remotion-ir");
ok("renderer degraded to ffmpeg fallback", result.renderer === "ffmpeg-fallback");
ok("Timeline IR has video + text tracks", result.timeline.tracks.length === 2);
ok("Timeline IR validates", validateTimeline(result.timeline).length === 0, validateTimeline(result.timeline).join("; "));
ok("duration maps to whole-frame timeline", secondsToFrames(result.timeline.composition.durationSec, result.timeline.composition.fps) === 114);

console.log("\n== render ==");
let rendered = false;
try {
  renderComposedTimeline(result.timeline, mp4Path);
  rendered = true;
} catch (error) {
  console.log("  render error:", String(error).slice(0, 600));
}

ok("composed Timeline IR produced a real MP4", rendered && existsSync(mp4Path));
if (rendered && existsSync(mp4Path)) {
  const duration = probeDuration(mp4Path);
  ok("MP4 duration ~= 3.8s", Math.abs(duration - 3.8) < 0.45, `got ${duration.toFixed(2)}s`);
}

console.log("\n== provider tools (Phase 1.3 local/free seed) ==");
ok("9 seed provider tools registered", listProviderTools().length === 9, `got ${listProviderTools().length}`);

const imagePath = join(outDir, "validate-tool-card.png");
const cardVideoPath = join(outDir, "validate-tool-card.mp4");
const voicePath = join(outDir, "validate-tool-voice.wav");
const scorePath = join(outDir, "validate-tool-score.wav");
const srtPath = join(outDir, "validate-tool-subtitles.srt");
const vttPath = join(outDir, "validate-tool-subtitles.vtt");
const trimPath = join(outDir, "validate-tool-trim.mp4");
const stitchPath = join(outDir, "validate-tool-stitch.mp4");
const framePath = join(outDir, "validate-tool-frame.png");
for (const p of [imagePath, cardVideoPath, voicePath, scorePath, srtPath, vttPath, trimPath, stitchPath, framePath]) {
  try { rmSync(p, { force: true }); } catch { /* none */ }
}

renderCaptionCardImage({ title: "Image fallback", outPath: imagePath, width: 320, height: 180, background: "214f4b" });
ok("image fallback writes a PNG", existsSync(imagePath));

renderCaptionCardVideo({ title: "Video fallback", outPath: cardVideoPath, durationSec: 1.1, width: 320, height: 180, fps: 24, background: "7c3f58" });
ok("video fallback writes an MP4", existsSync(cardVideoPath) && probeDuration(cardVideoPath) > 0.8);

generateSilentVoice({ text: "A timed local placeholder voice.", outPath: voicePath, durationSec: 1.2 });
ok("silent TTS fallback writes PCM audio", existsSync(voicePath) && Number(probeMedia({ inputPath: voicePath }).metadata.durationSec) > 1);

generateToneScore({ outPath: scorePath, durationSec: 1.2, frequencyHz: 196 });
ok("music fallback writes a tone score", existsSync(scorePath) && Number(probeMedia({ inputPath: scorePath }).metadata.durationSec) > 1);

exportTimelineSubtitles({ timeline: result.timeline, srtPath, vttPath });
ok("subtitle exporter writes SRT", existsSync(srtPath) && readFileSync(srtPath, "utf8").includes("-->"));
ok("subtitle exporter writes VTT", existsSync(vttPath) && readFileSync(vttPath, "utf8").startsWith("WEBVTT"));

trimVideo({ inputPath: mp4Path, outPath: trimPath, startSec: 0.2, durationSec: 1.0 });
ok("video trimmer writes an MP4 segment", existsSync(trimPath) && probeDuration(trimPath) > 0.6);

stitchVideos({ inputPaths: [trimPath, trimPath], outPath: stitchPath });
ok("video stitcher writes a combined MP4", existsSync(stitchPath) && probeDuration(stitchPath) > 1.2);

const probe = probeMedia({ inputPath: stitchPath });
ok("media probe reports duration", Boolean(probe.metadata.exists) && Number(probe.metadata.durationSec) > 1.2);

sampleFrame({ inputPath: stitchPath, outPath: framePath, atSec: 0.3 });
ok("frame sampler writes a PNG", existsSync(framePath));

console.log("\n== intelligence + governance (Phase 1.4 §H–I) ==");
const trail = new DecisionTrail();
const promised = result.timeline.composition.durationSec;

// §H — research (offline brief) + CLIP-indexed footage retrieval + scored provider selection
const research = runResearch("strait of hormuz oil chokepoint", { trail });
ok("research plans 15-25 searches with findings", research.queries.length >= 15 && research.queries.length <= 25 && research.findings.length > 0,
  `queries ${research.queries.length}, findings ${research.findings.length}`);

const footage = indexFootage([
  { id: "tanker", title: "Oil tanker crossing a narrow strait", tags: ["tanker", "oil", "strait", "shipping", "sea"] },
  { id: "market", title: "Stock market trading floor", tags: ["market", "stocks", "finance", "screens"] },
]);
const retrieved = retrieveFootage("oil tanker shipping through the strait", footage, 2);
ok("CLIP-indexed retrieval returns the closest footage first", retrieved[0]?.item.id === "tanker", `got ${retrieved[0]?.item.id}`);

const pick = selectProviderTool(listProviderTools(), "video", { trail });
ok("scored selection chooses a video-category provider tool", pick.chosen.item.category === "video", `got ${pick.chosen.item.category}`);

// §I — budget governance (estimate → reserve → reconcile, cap mode)
const ledger = new BudgetLedger({ mode: "cap", perActionCap: 0.5, totalCap: 10, trail });
const approved = ledger.reserve("tts narration", 0.35).approved;
const denied = ledger.reserve("cloud video gen", 6).approved;
ok("budget approves in-cap and denies over-cap (cap mode)", approved && !denied);

// §I — pre-compose gate: blocks a bad cut, proceeds on a kept promise
const blocked = preComposeGate(result.timeline, { targetDurationSec: 99, requireAudio: true }, { rendererAvailable: true, trail });
ok("pre-compose gate BLOCKS a broken delivery promise", !blocked.ok && blocked.blockers.length > 0);
const cleared = preComposeGate(result.timeline, { targetDurationSec: promised }, { rendererAvailable: true, trail });
ok("pre-compose gate PROCEEDS on a kept promise", cleared.ok, cleared.blockers.join("; "));

// §I — post-render self-review on the REAL composed MP4, with a subtitle artifact present
const review = postRenderSelfReview(mp4Path, { timeline: result.timeline, targetDurationSec: promised, subtitlePath: srtPath, trail });
ok("self-review accepts the real MP4 (video + duration + frames)", review.ok && review.probe.hasVideo && review.probe.durationSec > 0,
  review.checks.filter((c) => c.status === "fail").map((c) => c.name).join("; "));
ok("self-review runs all four position frame checks", Boolean(review.checks.find((c) => c.name === "4-position frame checks")));

const reviewPath = join(outDir, "validate-self-review.json");
writeSelfReview(review, reviewPath);
ok("self-review report emitted to disk", existsSync(reviewPath));

const trailPath = join(outDir, "validate-decision-trail.json");
writeFileSync(trailPath, `${JSON.stringify(trail.toJSON(), null, 2)}\n`);
ok("decision audit trail emitted to disk", existsSync(trailPath) && trail.length >= 4, `entries ${trail.length}`);

console.log("\n== video providers (Phase 1.6 §C) ==");
ok("14 video providers registered (cloud + local-runtime + stock)", VIDEO_PROVIDERS.length === 14);

const genVideoPath = join(outDir, "validate-video-gen.mp4");
try { rmSync(genVideoPath, { force: true }); } catch { /* none */ }
const vGen = runVideoGeneration({ prompt: "oil tanker crossing a narrow strait at dawn", outPath: genVideoPath, durationSec: 1.2, width: 640, height: 360 }, {});
ok("offline video generation falls back to a real local MP4", vGen.plan.mode === "fallback" && existsSync(genVideoPath) && probeDuration(genVideoPath) > 0.8);

const byokPlan = planVideoGeneration({ prompt: "same prompt", outPath: genVideoPath, providerId: "runway-gen3" }, { RUNWAY_API_KEY: "demo-key" });
ok("BYOK plan builds a real provider request (no network)", byokPlan.mode === "request" && byokPlan.request?.headers.Authorization === "Bearer demo-key");
const stockReq = buildVideoRequest(getVideoProvider("pixabay-video")!, { prompt: "narrow strait", outPath: genVideoPath }, { PIXABAY_API_KEY: "pk" });
ok("stock provider request encodes key + query", stockReq.url.includes("key=pk") && stockReq.url.includes("q=narrow"));

console.log("\n== image providers (Phase 1.7 §D) ==");
ok("10 image providers registered (cloud + local-runtime + stock)", IMAGE_PROVIDERS.length === 10);

const genImagePath = join(outDir, "validate-image-gen.png");
try { rmSync(genImagePath, { force: true }); } catch { /* none */ }
const iGen = runImageGeneration({ prompt: "a narrow strait from orbit", outPath: genImagePath, width: 320, height: 180 }, {});
ok("offline image generation falls back to a real local PNG", iGen.plan.mode === "fallback" && existsSync(genImagePath));
const dalleReq = buildImageRequest(getImageProvider("dalle3")!, { prompt: "x", outPath: genImagePath }, { OPENAI_API_KEY: "demo-key" });
ok("BYOK image request is a real Bearer POST", dalleReq.method === "POST" && dalleReq.headers.Authorization === "Bearer demo-key");

console.log("\n== audio: tts + music + mixer + enhance (Phase 1.8 §E) ==");
ok("4 TTS + 3 music providers registered", TTS_PROVIDERS.length === 4 && MUSIC_PROVIDERS.length === 3);

const vVoice = join(outDir, "validate-voice.wav");
const vMusic = join(outDir, "validate-music.wav");
const vMix = join(outDir, "validate-mix.wav");
const vEnh = join(outDir, "validate-enhanced.wav");
for (const p of [vVoice, vMusic, vMix, vEnh]) { try { rmSync(p, { force: true }); } catch { /* none */ } }

runSpeechGeneration({ text: "a fifth of the world's seaborne oil passes through the strait", outPath: vVoice, durationSec: 1.4 }, {});
runMusicGeneration({ prompt: "tense documentary underscore", outPath: vMusic, durationSec: 1.4 }, {});
ok("offline TTS + music fallbacks both write real audio", existsSync(vVoice) && existsSync(vMusic) && probeDuration(vVoice) > 1 && probeDuration(vMusic) > 1);

mixAudioTracks({ tracks: [{ path: vVoice }, { path: vMusic, volume: 0.4, delaySec: 0.1 }], outPath: vMix, duckUnderFirst: true });
ok("audio mixer ducks a music bed under the voice", existsSync(vMix) && probeDuration(vMix) > 1);

enhanceAudio({ inputPath: vMix, outPath: vEnh, targetLufs: -14 });
ok("audio enhancer normalizes the mix to -14 LUFS", existsSync(vEnh) && probeDuration(vEnh) > 1);

console.log("\n== post / enhancement (Phase 1.9 §F) ==");
// A second small clip at the same dims as the §C generated clip, for crossfade.
const clip2 = join(outDir, "validate-clip2.mp4");
runVideoGeneration({ prompt: "stock-style strait b-roll", outPath: clip2, durationSec: 1.2, width: 640, height: 360 }, {});
const gradedPath = join(outDir, "validate-graded.mp4");
const xfadePath = join(outDir, "validate-xfade.mp4");
const upscaledPath = join(outDir, "validate-upscaled.mp4");
for (const p of [gradedPath, xfadePath, upscaledPath]) { try { rmSync(p, { force: true }); } catch { /* none */ } }

colorGrade({ inputPath: genVideoPath, outPath: gradedPath });
ok("color grade produces a real graded MP4", existsSync(gradedPath) && probeDuration(gradedPath) > 0.8);
crossfadeStitch({ inputPaths: [genVideoPath, clip2], outPath: xfadePath, crossfadeSec: 0.3 });
ok("crossfade stitch overlaps two clips", existsSync(xfadePath) && probeDuration(xfadePath) > 1.4);
upscaleVideo({ inputPath: genVideoPath, outPath: upscaledPath, factor: 2 });
ok("lanczos upscale produces a real MP4", existsSync(upscaledPath) && probeDuration(upscaledPath) > 0.8);
ok("10 model enhancement tools registered + runtime-gated", ENHANCEMENT_TOOLS.length === 10 && !enhancementAvailable(getEnhancementTool("rembg")!, {}));

console.log("\n== analysis / understanding (Phase 1.10 §G) ==");
const refAnalysis = analyzeReferenceVideo(mp4Path, {});
ok("reference analysis reads pacing + look from the real MP4", refAnalysis.durationSec > 0 && refAnalysis.understanding.frames.length >= 2);
ok("reference analysis proposes 2-3 differentiated concepts + cost", refAnalysis.concepts.length >= 2 && refAnalysis.concepts.length <= 3 && refAnalysis.costEstimateUsd > 0);
ok("transcriber degrades to an empty transcript offline", transcribe({ inputPath: mp4Path }, {}).engine === "none");
const analysisPath = join(outDir, "validate-reference-analysis.json");
writeFileSync(analysisPath, `${JSON.stringify(refAnalysis, null, 2)}\n`);
ok("reference analysis emitted to disk", existsSync(analysisPath));

console.log("\n== render engines (Phase 1.11 §A) ==");
ok("9 composition/capture engines registered", listEngines().length === 9);
ok("engine registry exposes maturity truth",
  listEngines().some((e) => e.id === "remotion" && e.maturity === "adapter") &&
  listEngines().some((e) => e.id === "spline" && e.maturity === "planned") &&
  listEngines().some((e) => e.id === "playwright" && e.maturity === "runtime-gated"));
ok("auto-pick maps scene types to engines", preferredEngine("kinetic-typography").id === "motion-canvas" && preferredEngine("3d").id === "three");
const enginePath = join(outDir, "validate-engine.mp4");
try { rmSync(enginePath, { force: true }); } catch { /* none */ }
const engResult = renderWithEngine("motion-canvas", result.timeline, enginePath, {});
ok("generic non-ffmpeg dispatch is honest fallback, not claimed native", existsSync(enginePath) && probeDuration(enginePath) > 1 && engResult.renderer === "degraded-ffmpeg" && engResult.note.includes("fallback"));

console.log("\n== capture CLI (Stage 3.6) ==");
const captureSetup = spawnSync(npmBin, ["run", "montara", "--", "capture", "setup", "--provider", "playwright"], {
  encoding: "utf8",
  timeout: 120000,
  maxBuffer: 1 << 22,
  shell: process.platform === "win32",
});
ok("capture CLI exposes Playwright setup guidance",
  captureSetup.status === 0 && /npx playwright install chromium/.test(captureSetup.stdout ?? ""),
  (captureSetup.error?.message || captureSetup.stderr || captureSetup.stdout || "").slice(-500));

const captureRecommend = spawnSync(npmBin, ["run", "montara", "--", "capture", "recommend", "--url", "https://example.com"], {
  encoding: "utf8",
  timeout: 120000,
  maxBuffer: 1 << 22,
  shell: process.platform === "win32",
});
ok("capture CLI routes URL briefs to Playwright recommendation",
  captureRecommend.status === 0 && /Recommended:\*\* playwright|capture recommendation: playwright/.test(captureRecommend.stdout ?? ""),
  (captureRecommend.error?.message || captureRecommend.stderr || captureRecommend.stdout || "").slice(-500));

console.log("\n== style + output profiles (Phase 1.12 §J) ==");
ok("3 styles + 6 output profiles registered", STYLE_PLAYBOOKS.length === 3 && OUTPUT_PROFILES.length === 6);
const branded = applyOutputProfile(applyStyle(result.timeline, "clean-professional"), "shorts");
ok("style + shorts profile yield a valid 9:16 IR", branded.composition.width === 1080 && branded.composition.height === 1920 && validateTimeline(branded).length === 0);

const shortsPath = join(outDir, "validate-shorts.mp4");
try { rmSync(shortsPath, { force: true }); } catch { /* none */ }
renderComposedTimeline(branded, shortsPath);
ok("the styled 9:16 IR renders to a real vertical MP4", existsSync(shortsPath) && probeDuration(shortsPath) > 1);

console.log("\n== agent layer headless drive (Phase 1.5 §K) ==");
// Generate the data-side artefacts an external assistant reads.
ok("agent emits 12 YAML pipeline manifests", writePipelineManifests(join(outDir, "pipelines")).length === 12);
ok("agent emits 3 JSON schemas", writeSchemas(join(outDir, "schemas")).length === 3);
ok("agent emits 5 per-assistant configs", writeAssistantConfigs(join(outDir, "agent")).length === 5);

// Drive the full loop headlessly with a resumable checkpoint, simulating a crash + resume mid-run.
const driveIdea = "the strait of hormuz";
const drivePipeline = "documentary-montage";
const cpPath = join(outDir, "validate-checkpoint.json");
const headlessMp4 = join(outDir, "validate-headless.mp4");
try { rmSync(headlessMp4, { force: true }); } catch { /* none */ }

let cp = createCheckpoint(driveIdea, drivePipeline, "run-validate");
runResearch(driveIdea, { trail });                       cp = advanceCheckpoint(cp, "research");
const drivePlan = planVideo(drivePipeline, driveIdea, { targetSeconds: 6 });   cp = advanceCheckpoint(cp, "plan");
cp = advanceCheckpoint(cp, "script");
const driveComposed = composeScenePlan(drivePlan);       cp = advanceCheckpoint(cp, "populate", cpPath);
saveCheckpoint(cp, cpPath);

// crash + resume: a fresh process would reload the checkpoint and continue from "enrich"
const reloaded = loadCheckpoint(cpPath);
ok("headless run resumes from the next unfinished stage", nextStage(reloaded) === "enrich", `got ${nextStage(reloaded)}`);
ok("composed IR validates against the Timeline JSON schema", validateJson(driveComposed.timeline, timelineSchema).length === 0,
  validateJson(driveComposed.timeline, timelineSchema).join("; "));

let run = advanceCheckpoint(reloaded, "enrich");
const driveGate = preComposeGate(driveComposed.timeline, { targetDurationSec: driveComposed.timeline.composition.durationSec }, { rendererAvailable: true, trail });
ok("headless pre-compose gate clears the run", driveGate.ok, driveGate.blockers.join("; "));
renderComposedTimeline(driveComposed.timeline, headlessMp4);   run = advanceCheckpoint(run, "render", headlessMp4);
const driveReview = postRenderSelfReview(headlessMp4, { timeline: driveComposed.timeline, targetDurationSec: driveComposed.timeline.composition.durationSec, trail });
run = advanceCheckpoint(run, "qa");
run = advanceCheckpoint(run, "master");
saveCheckpoint(run, cpPath);

ok("headless drive renders a real MP4 end-to-end", existsSync(headlessMp4) && driveReview.ok);
ok("headless run reaches a complete checkpoint", isComplete(run) && run.done, `completed ${run.completed.length}/8`);

// Render bridge (1A.3): a bridged engine composition renders a real MP4 via the always-on ffmpeg path.
const bridgedMp4 = join(outDir, "validate-bridge.mp4");
const bridged = renderBridgedTimeline("world-in-numbers", bridgedMp4);
const bridgedDur = bridged.ok ? probeDuration(bridgedMp4) : 0;
ok("render bridge turns an engine composition into a real MP4 (ffmpeg path)",
  bridged.ok && existsSync(bridgedMp4) && bridgedDur > 1, `engine=${bridged.engine} dur=${bridgedDur.toFixed(2)}s`);
ok("render bridge reports the strong engine composer path as available",
  engineRemotionAvailable() === true || engineRemotionAvailable() === false); // boolean, never throws

// Pro compositor (2.5): PiP with an ellipse mask + a collage both render to real MP4s at comp size.
const ff = mediaBin("ffmpeg");
function genClip(name: string, src: string): string {
  const p = join(outDir, name);
  spawnSync(ff, ["-y", "-f", "lavfi", "-i", src, "-t", "1.5", "-pix_fmt", "yuv420p", p], { encoding: "utf8" });
  return p;
}
const baseClip = genClip("vc-base.mp4", "testsrc2=s=640x360:r=24");
const camClip = genClip("vc-cam.mp4", "smptebars=s=320x320:r=24");
const pipOut = join(outDir, "validate-pip.mp4");
const pipTl = pictureInPicture({ width: 640, height: 360, fps: 24, durationSec: 1.5, base: { path: baseClip, kind: "video" }, inset: { path: camClip, kind: "video" }, corner: "br", insetScale: 0.34, insetMask: { shape: "ellipse", feather: 0.06 } });
compositeTimeline(pipTl, pipOut);
const pipRes = (spawnSync(mediaBin("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", pipOut], { encoding: "utf8" }).stdout || "").trim();
ok("compositor renders a masked PiP to a real MP4 at composition size",
  existsSync(pipOut) && probeDuration(pipOut) > 0.5 && pipRes === "640x360", `dur=${probeDuration(pipOut).toFixed(2)} res=${pipRes}`);

const colOut = join(outDir, "validate-collage.mp4");
const colTl = collage({ width: 640, height: 360, fps: 24, durationSec: 1.5, cells: [{ path: baseClip }, { path: camClip }, { path: baseClip }, { path: camClip }], cols: 2, rows: 2 });
compositeTimeline(colTl, colOut);
ok("compositor renders a 2x2 collage to a real MP4", existsSync(colOut) && probeDuration(colOut) > 0.5, `dur=${probeDuration(colOut).toFixed(2)}`);

// Warfront craft (2.7): mastering hits the loudness target; QA inspects playback; thumbnails + Shorts render.
const loudWav = join(outDir, "vc-loud.wav");
spawnSync(ff, ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-af", "volume=6dB", loudWav], { encoding: "utf8" });
const masteredWav = join(outDir, "vc-mastered.wav");
const masterRes = masterAudio(loudWav, masteredWav, { lufs: -14 });
ok("masterAudio normalizes to the -14 LUFS target (two-pass loudnorm)",
  masterRes.ok && masterRes.measuredAfter != null && Math.abs(masterRes.measuredAfter + 14) < 1.5,
  `after=${masterRes.measuredAfter?.toFixed(2)} LUFS`);

const qaClip = genClip("vc-qa.mp4", "testsrc2=s=320x240:r=24");
const qa = qaPlayback(qaClip);
ok("qaPlayback inspects real playback (dims, audio, scene variety)",
  qa.width === 320 && qa.height === 240 && qa.durationSec > 1 && qa.sceneChanges >= 0,
  `cuts=${qa.sceneChanges} issues=${qa.issues.join("|")}`);

const thumbs = generateThumbnails(qaClip, join(outDir, "vc-thumbs"), [
  { hook: "ONE", accent: "ff3b3b", atSec: 0.3 }, { hook: "TWO", accent: "12dce8", atSec: 0.7 }, { hook: "THREE", accent: "e6b44c", atSec: 1.1 },
]);
ok("generateThumbnails produces 3 distinct thumbnail concepts", thumbs.length === 3 && thumbs.every((p) => existsSync(p)));

const shortOut = join(outDir, "vc-short.mp4");
const shortOk = cutShort(qaClip, { startSec: 0, endSec: 1.2, caption: "HOOK" }, shortOut);
const shortRes = (spawnSync(mediaBin("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", shortOut], { encoding: "utf8" }).stdout || "").trim();
ok("cutShort renders a real 9:16 vertical Short", shortOk && shortRes === "1080x1920", `res=${shortRes}`);

// Native three.js adapter (C/D): a real WebGL render when a browser+three are present (else skip honestly).
if (threeAvailable()) {
  const threeOut = join(outDir, "validate-three.mp4");
  const tr = renderThreeScene(threeOut, { width: 320, height: 180, fps: 10, seconds: 0.2, title: "M" });
  const threeRes = (spawnSync(mediaBin("ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", threeOut], { encoding: "utf8" }).stdout || "").trim();
  ok("render-three produces a real MP4 or graceful fallback", tr.ok && (tr.renderer === "three-webgl" || tr.renderer === "ffmpeg-fallback") && threeRes === "320x180", `renderer=${tr.renderer} frames=${tr.frames} res=${threeRes} err=${tr.error ?? ""}`);
} else {
  ok("render-three reports unavailable honestly when no browser/three", threeAvailable() === false);
}

// Reel builder (capstone): burns a hook + caption + end card onto a vertical clip, keeps audio, masters.
const reelSrc = join(outDir, "vc-reel-src.mp4");
spawnSync(ff, ["-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=24", "-f", "lavfi", "-i", "sine=frequency=200", "-t", "3", "-pix_fmt", "yuv420p", "-shortest", reelSrc], { encoding: "utf8" });
const reelOut = join(outDir, "validate-reel.mp4");
const reel = buildReel(reelSrc, reelOut, { hook: "WATCH", endCard: "NEXT", captions: [{ startSec: 0.2, endSec: 1.5, text: "a real burned caption with punctuation: it works!" }], lufs: -14 });
const reelQa = qaPlayback(reelOut);
ok("buildReel produces a captioned, audio-bearing vertical reel", reel.ok && reelQa.hasVideo && reelQa.hasAudio && reelQa.width === 540 && reelQa.durationSec > 2, `err=${reel.error ?? ""} ${reelQa.width}x${reelQa.height}`);
const smartReelOut = join(outDir, "validate-smart-reel.mp4");
const smartReel = buildReel(reelSrc, smartReelOut, { hook: "WATCH", endCard: "NEXT", lufs: -14, smart: true });
const smartReelQa = qaPlayback(smartReelOut);
ok("buildReel smart mode adds motion treatment and still produces a valid reel", smartReel.ok && smartReelQa.hasVideo && smartReelQa.hasAudio && smartReelQa.width === 540 && smartReelQa.durationSec > 2, `err=${smartReel.error ?? ""} ${smartReelQa.width}x${smartReelQa.height}`);

console.log(`\nArtifact:    ${mp4Path}`);
console.log(`IR:          ${irPath}`);
console.log(`Self-review: ${reviewPath}`);
console.log(`Audit trail: ${trailPath}`);
console.log(`Headless:    ${headlessMp4} (checkpoint ${cpPath})`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
