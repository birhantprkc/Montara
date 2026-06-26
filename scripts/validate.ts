// Montara validate harness: compose core + Phase 1.3 local provider tools.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScenePlan } from "../packages/core/src/index";
import { secondsToFrames, validateTimeline } from "../packages/core/src/index";
import { composeScenePlan, renderComposedTimeline } from "../packages/render-remotion/src/index";
import { probeDuration } from "../packages/render-ffmpeg/src/index";
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

console.log(`\nArtifact:    ${mp4Path}`);
console.log(`IR:          ${irPath}`);
console.log(`Self-review: ${reviewPath}`);
console.log(`Audit trail: ${trailPath}`);
console.log(`Headless:    ${headlessMp4} (checkpoint ${cpPath})`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
