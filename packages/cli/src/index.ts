import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ScenePlan, Timeline } from "../../core/src/index";
import { validateTimeline } from "../../core/src/index";
import { renderScenePlan, renderTimeline } from "../../render-ffmpeg/src/index";
import { composeScenePlan, renderComposedScenePlan } from "../../render-remotion/src/index";
import { listPipelines, planVideo } from "../../ai/src/index";
import { listProviderTools, listVideoProviders, listImageProviders, providerAvailable } from "../../providers/src/index";
import { preComposeGate, postRenderSelfReview, writeSelfReview } from "../../quality/src/index";
import { runResearch } from "../../research/src/index";
import { writePipelineManifests, writeSchemas, writeAssistantConfigs, SKILLS_ENTRY } from "../../agent/src/index";
import { runDoctor } from "./doctor";

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
  doctor                          check local render prerequisites
  pipelines                       list the available pipeline shapes
  tools                           list local/free provider tools
  providers [video|image]         list generation providers + availability
  research <idea>                 plan 15-25 searches + write a research brief to ./out
  plan  [opts] <idea>             write a structured scene plan to ./out
  make  [opts] <idea>             plan + gate + compose + render + self-review to ./out
  render <ir.json>                render a ScenePlan or Timeline IR JSON to MP4
  review <mp4>                    post-render self-review report for an MP4
  agent                           regenerate pipeline manifests + schemas + assistant configs

Options (plan/make):
  --pipeline, -p <id>             pipeline shape (default: animated-explainer)
  --seconds,  -s <n>              target runtime in seconds (default: 20)
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

    if (command === "pipelines") {
      for (const p of listPipelines()) console.log(`${p.id.padEnd(22)} ${p.blurb}`);
      return 0;
    }

    if (command === "tools") {
      for (const tool of listProviderTools()) console.log(`${tool.id.padEnd(28)} ${tool.category.padEnd(8)} ${tool.description}`);
      return 0;
    }

    if (command === "providers") {
      const category = rest[0] === "image" ? "image" : "video";
      const providers = category === "image" ? listImageProviders(true) : listVideoProviders(true);
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

process.exitCode = main();
