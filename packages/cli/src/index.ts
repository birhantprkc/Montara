import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ScenePlan, Timeline } from "../../core/src/index";
import { validateTimeline } from "../../core/src/index";
import { renderScenePlan, renderTimeline } from "../../render-ffmpeg/src/index";
import { composeScenePlan, renderComposedScenePlan } from "../../render-remotion/src/index";
import { runDoctor } from "./doctor";

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

function printHelp(): void {
  console.log(`montara <command>

Commands:
  doctor                 check local render prerequisites
  plan <idea>            write a deterministic local scene plan to ./out
  make <idea>            compose a scene plan and render an MP4 to ./out
  render <ir.json>       render a ScenePlan or Timeline IR JSON to MP4
`);
}

export function main(argv = process.argv.slice(2)): number {
  const [command, ...rest] = argv;
  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      printHelp();
      return 0;
    }

    if (command === "doctor") return runDoctor();

    if (command === "plan") {
      const idea = rest.join(" ");
      const plan = fallbackPlan(idea);
      const out = join(process.cwd(), "out", `${slug(idea)}.scene-plan.json`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
      console.log(out);
      return 0;
    }

    if (command === "make") {
      const idea = rest.join(" ");
      const plan = fallbackPlan(idea);
      const composed = composeScenePlan(plan);
      const issues = validateTimeline(composed.timeline);
      if (issues.length) throw new Error(`compose failed: ${issues.join("; ")}`);
      const base = slug(idea);
      const ir = join(process.cwd(), "out", `${base}.timeline.json`);
      const mp4 = join(process.cwd(), "out", `${base}.mp4`);
      mkdirSync(dirname(ir), { recursive: true });
      writeFileSync(ir, `${JSON.stringify(composed.timeline, null, 2)}\n`);
      renderComposedScenePlan(plan, mp4);
      console.log(mp4);
      return existsSync(mp4) ? 0 : 1;
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

process.exitCode = main();
