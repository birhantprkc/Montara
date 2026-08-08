// @montara/cli — `montara replace-bg`: matte a subject and put it on a new backdrop.
//
// This is the orchestration layer Montara is supposed to expose to an agent: one command
// that runs the expensive model step, writes a Timeline IR describing the result, and
// renders it. The IR is the handoff, not a hidden internal — it is written next to the MP4
// so the next instruction ("move the title", "add a cut") is an edit to that file rather
// than a re-run of the whole pipeline.
//
// Reusing a matte with --matte is deliberate: matting is the only slow step here, so
// iterating on the look must never re-run it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import type { Clip, MediaClip, TextClip, Timeline } from "../../core/src/index";
import { validateTimeline } from "../../core/src/index";
import { compositeTimeline, mediaBin } from "../../render-ffmpeg/src/index";
import { autoMatte } from "../../vision/src/index";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function positional(args: string[], nth: number): string | undefined {
  const plain: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg.startsWith("--")) {
      // Skip a value that belongs to this flag.
      const next = args[i + 1];
      if (next && !next.startsWith("--")) i += 1;
      continue;
    }
    plain.push(arg);
  }
  return plain[nth];
}

interface Probe {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  hasAudio: boolean;
}

function probe(path: string): Probe | null {
  const result = spawnSync(mediaBin("ffprobe"), [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path,
  ], { encoding: "utf8", maxBuffer: 1 << 24 });
  if (result.status !== 0) return null;
  try {
    const payload = JSON.parse(result.stdout ?? "") as {
      streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string }[];
      format?: { duration?: string };
    };
    const video = payload.streams?.find((s) => s.codec_type === "video");
    if (!video) return null;
    const [num = "0", den = "1"] = String(video.avg_frame_rate ?? "0/1").split("/");
    const fps = Number(den) ? Number(num) / Number(den) : 0;
    return {
      width: video.width ?? 0,
      height: video.height ?? 0,
      fps: fps > 0 ? fps : 30,
      durationSec: Number(payload.format?.duration ?? 0) || 0,
      hasAudio: (payload.streams ?? []).some((s) => s.codec_type === "audio"),
    };
  } catch {
    return null;
  }
}

function parseSize(value: string | undefined, fallback: { w: number; h: number }): { w: number; h: number } {
  const match = /^(\d+)x(\d+)$/.exec(value ?? "");
  if (!match) return fallback;
  return { w: Number(match[1] ?? 0), h: Number(match[2] ?? 0) };
}

/** Even dimensions only: libx264 refuses odd sizes in yuv420p. */
function even(n: number): number {
  return Math.max(2, Math.round(n) - (Math.round(n) % 2));
}

export interface BackdropPlan {
  timeline: Timeline;
  mattePath: string;
  irPath: string;
  outPath: string;
}

/** Build the IR for "subject over backdrop", optionally with a title tucked behind them. */
export function buildBackdropTimeline(opts: {
  subject: string;
  backdrop: string;
  mattePath: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  sourceInSec?: number;
  text?: string;
  textColor?: string;
  textSize?: number;
  textY?: number;
  textInFront?: boolean;
  /** Animate the title up into place from below, revealing it from behind the subject. */
  rise?: { fromPx: number; delaySec: number; durationSec: number };
  subjectScale?: number;
  subjectY?: number;
  chokePx?: number;
  featherPx?: number;
  keepAudio?: boolean;
}): Timeline {
  const clips: Clip[] = [];
  const textClips: TextClip[] = [];

  const backdrop: MediaClip = {
    id: "backdrop",
    type: "video",
    startSec: 0,
    durationSec: opts.durationSec,
    z: 0,
    source: { kind: /\.(mp4|mov|mkv|webm|avi)$/i.test(opts.backdrop) ? "video" : "image", path: opts.backdrop },
    box: { wFrac: 1, hFrac: 1 },
    transform: { x: opts.width / 2, y: opts.height / 2 },
  };
  clips.push(backdrop);

  if (opts.text) {
    const restY = opts.textY ?? Math.round(opts.height * 0.42);
    const title: TextClip = {
      id: "title",
      type: "text",
      startSec: 0,
      durationSec: opts.durationSec,
      // z 10 sits above the backdrop and below the subject at z 20 — the whole point.
      z: opts.textInFront ? 30 : 10,
      text: opts.text,
      style: {
        fontSize: opts.textSize ?? Math.round(opts.height * 0.19),
        color: opts.textColor ?? "ffffff",
        shadow: false,
      },
      transform: { x: opts.width / 2, y: restY },
    };
    if (opts.rise) {
      // Ease-out landing: fast off the mark, settling into place. Linear reads as a slide.
      title.keyframes = {
        y: [
          { atSec: opts.rise.delaySec, value: restY + opts.rise.fromPx, easing: "ease-out" },
          { atSec: opts.rise.delaySec + opts.rise.durationSec, value: restY, easing: "ease-out" },
        ],
      };
    }
    textClips.push(title);
  }

  const subjectScale = opts.subjectScale ?? 1;
  const subject: MediaClip = {
    id: "subject",
    type: "video",
    startSec: 0,
    durationSec: opts.durationSec,
    z: 20,
    source: { kind: "video", path: opts.subject },
    sourceInSec: opts.sourceInSec ?? 0,
    box: { wFrac: subjectScale, hFrac: subjectScale },
    transform: { x: opts.width / 2, y: opts.subjectY ?? opts.height / 2 },
    matte: {
      path: opts.mattePath,
      kind: "luma",
      chokePx: opts.chokePx ?? 1,
      featherPx: opts.featherPx ?? 1,
    },
  };
  clips.push(subject);

  // Text lives on its own track (the IR requires it); depth comes from `z`, not track order.
  const tracks: Timeline["tracks"] = [{ id: "v1", type: "video", clips }];
  if (textClips.length) tracks.push({ id: "t1", type: "text", clips: textClips });
  if (opts.keepAudio) {
    tracks.push({
      id: "a1",
      type: "audio",
      clips: [{
        id: "subject-audio",
        type: "audio",
        startSec: 0,
        durationSec: opts.durationSec,
        source: { kind: "file", path: opts.subject },
        volume: 1,
      }],
    });
  }

  return {
    version: "1.1",
    composition: {
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      durationSec: opts.durationSec,
      background: "000000",
    },
    tracks,
    metadata: { producedBy: "montara replace-bg" },
  };
}

const USAGE = `usage: montara replace-bg <subject-video> <backdrop-image|video> [out.mp4]
  --text "TITLE"        headline placed BEHIND the subject (the depth shot)
  --front-text          put the headline in front instead
  --text-color hex      default ffffff
  --text-size px        default ~19% of comp height
  --text-y px           vertical centre of the headline
  --rise                animate the headline up from behind the subject
  --rise-from px        travel distance, default 60% of the type size
  --rise-delay sec      default 0.4
  --rise-time sec       default 1.6
  --subject-scale N     enlarge the subject layer (1 = source framing)
  --subject-y px        vertical centre of the subject, for grounding the feet
  --size WxH            composition size, default 1920x1080
  --fps N               default: source fps, capped at 30
  --seconds N           trim the output
  --start N             seek into the subject before matting
  --matte path.mp4      reuse an existing matte instead of re-running the model
  --keep-matte          keep the generated matte for the next run
  --choke px            shrink the matte edge (default 1)
  --feather px          soften the matte edge (default 1)
  --audio               keep the subject's audio
  --ir path.json        where to write the Timeline IR (default: next to the MP4)
  --cpu                 ignore the GPU
  --no-download         never fetch weights
  --json                machine-readable result`;

/** `montara replace-bg` — matte the subject, drop it on a new backdrop, render, keep the IR. */
export function runReplaceBackgroundCommand(args: string[]): number {
  const subject = positional(args, 0);
  const backdrop = positional(args, 1);
  if (!subject || !backdrop) {
    console.error(USAGE);
    return 1;
  }
  if (!existsSync(subject)) {
    console.error(`subject not found: ${subject}`);
    return 1;
  }
  if (!existsSync(backdrop)) {
    console.error(`backdrop not found: ${backdrop}`);
    return 1;
  }

  const outFile = resolve(positional(args, 2) ?? join(process.cwd(), "out", "replace-bg.mp4"));
  const workDir = dirname(outFile);
  mkdirSync(workDir, { recursive: true });

  const info = probe(subject);
  if (!info) {
    console.error(`could not probe subject: ${subject}`);
    return 1;
  }

  const size = parseSize(flag(args, "--size"), { w: 1920, h: 1080 });
  const width = even(size.w);
  const height = even(size.h);
  const fps = Math.round(Number(flag(args, "--fps") ?? Math.min(info.fps, 30)));
  const startSec = Number(flag(args, "--start") ?? 0) || 0;
  const available = Math.max(0.1, info.durationSec - startSec);
  const durationSec = Math.round(Math.min(Number(flag(args, "--seconds") ?? available) || available, available) * 1000) / 1000;
  const json = has(args, "--json");

  // Matting is the expensive step, so an explicit --matte short-circuits it entirely.
  const reuse = flag(args, "--matte");
  let mattePath = reuse ?? join(workDir, "matte.mp4");
  let strategy = "reused";
  let matteReason = reuse ? `reused ${reuse}` : "";

  if (reuse) {
    if (!existsSync(reuse)) {
      console.error(`matte not found: ${reuse}`);
      return 1;
    }
  } else {
    if (!json) console.log(`matting subject (${info.width}x${info.height} @ ${info.fps.toFixed(2)}fps)...`);
    const matte = autoMatte(subject, {
      outMattePath: mattePath,
      workDir,
      maxWidth: width,
      // The matte is indexed from frame 0 of the source, so we only need it up to the
      // last frame we actually render. Trimming here is the difference between a demo
      // and a coffee break.
      maxFrames: Math.ceil((startSec + durationSec) * info.fps) + 2,
      forceCpu: has(args, "--cpu"),
      download: has(args, "--no-download") ? "never" : "auto",
      variant: flag(args, "--variant"),
    });
    if (!matte.ok || !matte.mattePath) {
      console.error(`matte unavailable: ${matte.reason}`);
      for (const attempt of matte.attempts) console.error(`  ${attempt.strategy}: ${attempt.reason}`);
      console.error("  run montara models plan to see what this machine can run");
      return 1;
    }
    mattePath = matte.mattePath;
    strategy = matte.strategy;
    matteReason = matte.reason;
    if (!json) console.log(`  matte (${strategy}): ${matteReason}`);
  }

  const timeline = buildBackdropTimeline({
    subject,
    backdrop,
    mattePath,
    width,
    height,
    fps,
    durationSec,
    sourceInSec: startSec,
    text: flag(args, "--text"),
    textColor: flag(args, "--text-color"),
    textSize: Number(flag(args, "--text-size")) || undefined,
    textY: Number(flag(args, "--text-y")) || undefined,
    textInFront: has(args, "--front-text"),
    rise: has(args, "--rise")
      ? {
          fromPx: Number(flag(args, "--rise-from")) || Math.round((Number(flag(args, "--text-size")) || height * 0.19) * 0.6),
          delaySec: Number(flag(args, "--rise-delay") ?? 0.4) || 0.4,
          durationSec: Number(flag(args, "--rise-time") ?? 1.6) || 1.6,
        }
      : undefined,
    subjectScale: Number(flag(args, "--subject-scale")) || undefined,
    subjectY: Number(flag(args, "--subject-y")) || undefined,
    chokePx: flag(args, "--choke") != null ? Number(flag(args, "--choke")) : undefined,
    featherPx: flag(args, "--feather") != null ? Number(flag(args, "--feather")) : undefined,
    keepAudio: has(args, "--audio") && info.hasAudio,
  });

  const issues = validateTimeline(timeline);
  if (issues.length) {
    console.error(`built an invalid timeline: ${issues.join("; ")}`);
    return 1;
  }

  const irPath = resolve(flag(args, "--ir") ?? outFile.replace(/\.mp4$/i, ".timeline.json"));
  mkdirSync(dirname(irPath), { recursive: true });
  writeFileSync(irPath, `${JSON.stringify(timeline, null, 2)}\n`);

  if (!json) console.log(`rendering ${width}x${height} @ ${fps}fps for ${durationSec}s...`);
  let rendered: string;
  try {
    rendered = compositeTimeline(timeline, outFile);
  } catch (error) {
    console.error(`render failed: ${(error as Error).message}`);
    console.error(`  the IR is at ${irPath} — fix it and run montara render ${irPath}`);
    return 1;
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, out: rendered, ir: irPath, matte: mattePath, strategy, reason: matteReason }, null, 2));
  } else {
    console.log(`video -> ${rendered}`);
    console.log(`   ir -> ${irPath}   (edit it, then: montara render ${irPath})`);
    console.log(`matte -> ${mattePath}   (reuse it: --matte ${mattePath})`);
  }
  return 0;
}
