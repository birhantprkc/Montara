// Montara verify harness. Contract tests for core + render-ffmpeg, including real MP4 renders.

import { existsSync, rmSync } from "node:fs";
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
import { listProviderTools } from "../packages/providers/src/index";

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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
