import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { runDoctor } from "./doctor";

const VIDEO_KINDS = ["reel", "short", "youtube", "documentary", "explainer", "screen-demo"] as const;
type VideoKind = (typeof VIDEO_KINDS)[number];
type StudioMode = "create" | "edit";

interface StartChoices {
  mode: StudioMode;
  kind: VideoKind;
  niche: string;
  topic: string;
  seconds: number;
}

const KIND_PIPELINE: Record<VideoKind, string> = {
  reel: "smart-reel",
  short: "smart-reel",
  youtube: "animated-explainer",
  documentary: "documentary-montage",
  explainer: "animated-explainer",
  "screen-demo": "screen-demo",
};

const KIND_PROFILE: Record<VideoKind, { id: string; seconds: number }> = {
  reel: { id: "instagram-reel", seconds: 30 },
  short: { id: "youtube-short", seconds: 45 },
  youtube: { id: "youtube-16x9", seconds: 90 },
  documentary: { id: "youtube-16x9", seconds: 60 },
  explainer: { id: "youtube-16x9", seconds: 45 },
  "screen-demo": { id: "youtube-16x9", seconds: 30 },
};

function isVideoKind(value: string): value is VideoKind {
  return (VIDEO_KINDS as readonly string[]).includes(value);
}

async function ask(rl: ReturnType<typeof createInterface>, prompt: string, fallback = ""): Promise<string> {
  const answer = (await rl.question(prompt)).trim();
  return answer || fallback;
}

async function choose<T extends string>(
  rl: ReturnType<typeof createInterface>,
  title: string,
  options: { id: T; label: string }[],
): Promise<T> {
  const first = options[0];
  if (!first) throw new Error(`No options available for ${title}`);
  console.log(`\n${title}`);
  options.forEach((option, index) => console.log(`  ${index + 1}. ${option.label}`));
  const raw = await ask(rl, `Pick 1-${options.length}: `, "1");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return first.id;
  const index = Math.max(0, Math.min(options.length - 1, Math.round(parsed) - 1));
  return options[index]?.id ?? first.id;
}

function banner(): void {
  console.log(`
  MONTARA
  Local-first video studio / Timeline IR / FFmpeg / Remotion / Blender / Three.js
`);
}

function montaraBin(): [string, string] {
  const root = process.cwd();
  const bundled = join(root, "packages", "cli", ".montara.mjs");
  return ["node", bundled];
}

function runMontara(args: string[]): number {
  const [bin, ...pre] = montaraBin();
  const result = spawnSync(bin, [...pre, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
  });
  return result.status ?? 1;
}

export async function runStartCommand(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      "usage: montara start [--skip-doctor] [--non-interactive create|edit] [--kind reel|short|youtube|documentary|explainer|screen-demo] [--niche TEXT] [--topic TEXT]",
    );
    return 0;
  }

  const nonInteractive = argv.includes("--non-interactive");
  const skipDoctor = argv.includes("--skip-doctor");
  const getFlag = (name: string): string | undefined => {
    const eq = argv.find((arg) => arg.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const index = argv.indexOf(name);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
  };

  let choices: StartChoices;

  if (!skipDoctor) {
    console.log("Running preflight checks...\n");
    const doctorStatus = runDoctor([]);
    if (doctorStatus !== 0) {
      console.log("\nFix setup first, or rerun with --skip-doctor if you know what you are doing.");
      return doctorStatus;
    }
    console.log("");
  }

  if (nonInteractive) {
    const nonInteractiveIndex = argv.indexOf("--non-interactive");
    const rawMode = getFlag("--mode") ?? argv[nonInteractiveIndex + 1] ?? "create";
    const rawKind = getFlag("--kind") ?? "explainer";
    const kind = isVideoKind(rawKind) ? rawKind : "explainer";
    const seconds = Number(getFlag("--seconds") ?? KIND_PROFILE[kind].seconds);
    choices = {
      mode: rawMode === "edit" ? "edit" : "create",
      kind,
      niche: getFlag("--niche") ?? "technology",
      topic: getFlag("--topic") ?? "How Montara turns one timeline into any video format",
      seconds: Number.isFinite(seconds) ? seconds : KIND_PROFILE[kind].seconds,
    };
  } else {
    const rl = createInterface({ input, output });
    try {
      banner();
      console.log("Montara is started.\nWhat can I do for you today?\n");
      const mode = await choose<StudioMode>(rl, "Studio mode", [
        { id: "create", label: "Create videos - plan, compose, and render a new piece" },
        { id: "edit", label: "Edit videos - understand, reel-cut, export, or hand off to an editor" },
      ]);

      if (mode === "edit") {
        console.log("\nEdit mode routes:");
        console.log("  montara understand <video>     scene + frame intelligence");
        console.log("  montara reel <video>           smart vertical/short cut");
        console.log("  montara export <timeline.json> EDL / OTIO / FCPXML");
        console.log("  montara compose <edit.json>    Python video_compose assembly");
        const path = await ask(rl, "\nPath to a video or timeline JSON (optional): ");
        rl.close();
        if (path.endsWith(".json")) return runMontara(["render", path]);
        if (path) return runMontara(["understand", path, "--vision", "auto"]);
        return 0;
      }

      const kind = await choose<VideoKind>(rl, "How would you like to make your video?", [
        { id: "reel", label: "Instagram Reel - vertical, punchy, 30s" },
        { id: "short", label: "YouTube Short - vertical hook + captions, about 45s" },
        { id: "youtube", label: "YouTube video - 16:9 explainer or essay, about 90s" },
        { id: "documentary", label: "Documentary - evidence-led montage in your niche, about 60s" },
        { id: "explainer", label: "Animated explainer - motion graphics, about 45s" },
        { id: "screen-demo", label: "Screen demo - capture + compose product walkthrough" },
      ]);

      const niche = await ask(rl, "\nWhat's your niche? (e.g. geopolitics, AI, fitness, fintech): ", "general");
      const topic = await ask(rl, "What's the video about? ", `A ${niche} ${kind} about a topic your audience cares about`);
      const seconds = Number(await ask(rl, "Target length in seconds: ", String(KIND_PROFILE[kind].seconds)));
      choices = {
        mode,
        kind,
        niche,
        topic,
        seconds: Number.isFinite(seconds) ? seconds : KIND_PROFILE[kind].seconds,
      };
      rl.close();
    } catch (error) {
      rl.close();
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  const pipeline = KIND_PIPELINE[choices.kind];
  const profile = KIND_PROFILE[choices.kind];
  const brief = `${choices.topic}. Niche: ${choices.niche}. Format: ${choices.kind}. Voice: system TTS.`;

  console.log("\n-- Montara production brief --");
  console.log(`  pipeline : ${pipeline}`);
  console.log(`  profile  : ${profile.id}`);
  console.log(`  length   : ~${choices.seconds}s`);
  console.log(`  niche    : ${choices.niche}`);
  console.log(`  topic    : ${choices.topic}`);
  console.log("------------------------------\n");
  console.log("Starting production...\n");

  if (choices.kind === "screen-demo") {
    const captureOut = join(process.cwd(), "out", "montara-capture-raw.mp4");
    const captureStatus = runMontara(["capture", "--url", "https://example.com", captureOut]);
    if (captureStatus !== 0) console.log("capture skipped - continuing with compose/make fallback");
    return runMontara(["make", "--pipeline", pipeline, "--seconds", String(choices.seconds), brief]);
  }

  if (choices.kind === "documentary") {
    const corpus = join(process.cwd(), "out", "start-documentary-corpus");
    runMontara(["corpus", "sources"]);
    console.log(`\nTip: seed stock with  montara corpus build ${corpus}  then compose, or run with PEXELS_API_KEY for live B-roll.`);
  }

  return runMontara([
    "make",
    "--pipeline",
    pipeline,
    "--seconds",
    String(choices.seconds),
    brief,
  ]);
}
