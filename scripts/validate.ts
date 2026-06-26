// Montara validate harness for Phase 1.1: scene-plan -> composer -> Timeline IR -> encoded MP4.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScenePlan } from "../packages/core/src/index";
import { secondsToFrames, validateTimeline } from "../packages/core/src/index";
import { composeScenePlan, renderComposedTimeline } from "../packages/render-remotion/src/index";
import { probeDuration } from "../packages/render-ffmpeg/src/index";

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

console.log("== Montara validate (Phase 1.1 compose core) ==\n");

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

console.log(`\nArtifact: ${mp4Path}`);
console.log(`IR:       ${irPath}`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail === 0 ? 0 : 1);
