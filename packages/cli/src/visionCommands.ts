// @montara/cli — matting, segmentation, detection, and audio restoration commands.
//
// Every one of these degrades honestly: if the machine cannot run a model we say so and
// return 0 where the result is advisory, rather than failing a pipeline over a model the
// user was never able to run in the first place.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  describeHardware,
  planVisionModels,
  probeHardware,
  listVisionModels,
} from "../../runtimes/src/index";
import { autoMatte, detectObjects, segmentObject, type DetectionBox } from "../../vision/src/index";
import { masterAudio, restoreVoice, type DenoiseLevel } from "../../render-ffmpeg/src/index";
import { analyzeMusic, measureVoiceQuality, separateStems, separateStemsAvailable } from "../../hear/src/index";
import {
  closeGaps,
  crossfade,
  findGaps,
  jCut,
  lCut,
  rippleDelete,
  rippleTrim,
  rollEdit,
  setMatte,
  slideClip,
  slipClip,
  splitClip,
  validateTimeline,
  type Matte,
  type Timeline,
} from "../../core/src/index";

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function outPath(candidate: string | undefined, fallback: string): string {
  return candidate && !candidate.startsWith("--") ? candidate : fallback;
}

function writeJson(path: string, value: unknown): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

/** `montara models` — what this machine can run, and what it will refuse to download. */
export function runModelsCommand(args: string[]): number {
  const sub = args[0] && !args[0].startsWith("--") ? args[0] : "plan";
  const json = has(args, "--json");
  const hardware = probeHardware({ forceCpu: has(args, "--cpu") });

  if (sub === "hardware") {
    if (json) { console.log(JSON.stringify(hardware, null, 2)); return 0; }
    console.log(describeHardware(hardware));
    console.log(`  free disk: ${hardware.freeDiskMb < 0 ? "unknown" : `${hardware.freeDiskMb} MB`}`);
    for (const note of hardware.notes) console.log(`  note: ${note}`);
    return 0;
  }

  if (sub === "list") {
    const models = listVisionModels();
    if (json) { console.log(JSON.stringify(models, null, 2)); return 0; }
    for (const model of models) {
      console.log(`${model.id.padEnd(24)} ${model.downloadMb} MB  vram>=${model.minVramMb}MB  cpu=${model.cpuViable ? "yes" : "no"}  ${model.license}`);
    }
    return 0;
  }

  if (sub !== "plan") {
    console.error("usage: montara models [plan|list|hardware] [--cpu] [--json]");
    return 1;
  }

  const plan = planVisionModels(hardware, { forceCpu: has(args, "--cpu") });
  if (json) { console.log(JSON.stringify(plan, null, 2)); return 0; }

  console.log(describeHardware(hardware));
  for (const selection of plan.selections) {
    if (selection.chosen && selection.downloadApproved) {
      console.log(`  ${selection.family.padEnd(6)} -> ${selection.chosen.id} on ${selection.device} (${selection.chosen.downloadMb} MB)`);
    } else {
      console.log(`  ${selection.family.padEnd(6)} -> will NOT download: ${selection.reason}`);
      for (const rejected of selection.rejected.slice(0, 3)) {
        console.log(`      ${rejected.id}: ${rejected.reason}`);
      }
    }
  }
  for (const note of plan.notes) console.log(`  note: ${note}`);
  return 0;
}

/** Point a clip in a Timeline IR at a freshly generated matte and write it back. */
function applyMatteToTimeline(timelinePath: string, clipId: string, matte: Matte): string | null {
  if (!existsSync(timelinePath)) return null;
  const timeline = JSON.parse(readFileSync(timelinePath, "utf8")) as Timeline;
  const updated = setMatte(timeline, clipId, matte);
  return writeJson(timelinePath, updated);
}

/** `montara matte` — background removal without a green screen. */
export function runMatteCommand(args: string[]): number {
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara matte <video> [out-matte.mp4] [--variant id] [--cpu] [--no-download] [--chromakey [hex]] [--foreground out.mp4] [--apply-to timeline.json --clip id] [--json]");
    return 1;
  }
  const out = outPath(args[1], join(process.cwd(), "out", "vision", "matte.mp4"));
  const result = autoMatte(input, {
    outMattePath: out,
    workDir: dirname(out),
    variant: flag(args, "--variant"),
    forceCpu: has(args, "--cpu"),
    download: has(args, "--no-download") ? "never" : "auto",
    allowChromakeyFallback: has(args, "--chromakey"),
    chromakeyColor: flag(args, "--chromakey"),
  });

  if (has(args, "--json")) console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(`matte unavailable: ${result.reason}`);
    for (const attempt of result.attempts) console.error(`  ${attempt.strategy}: ${attempt.reason}`);
    console.error("  run montara models plan to see what this machine can run");
    return 1;
  }

  if (!has(args, "--json")) {
    console.log(`matte (${result.strategy}) -> ${result.mattePath}`);
    console.log(`  ${result.reason}`);
  }

  const applyTo = flag(args, "--apply-to");
  const clipId = flag(args, "--clip");
  if (applyTo && clipId && result.mattePath) {
    const written = applyMatteToTimeline(applyTo, clipId, { path: result.mattePath, kind: "luma", featherPx: 1 });
    if (written) console.log(`applied matte to clip ${clipId} -> ${written}`);
    else console.error(`could not read timeline: ${applyTo}`);
  }
  return 0;
}

/** `montara detect` — subject/object detection for masking prompts and auto-framing. */
export function runDetectCommand(args: string[]): number {
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara detect <video> [out.json] [--classes person,car] [--stride 5] [--conf 0.35] [--cpu] [--no-download] [--json]");
    return 1;
  }
  const out = outPath(args[1], join(process.cwd(), "out", "vision", "detections.json"));
  const classes = flag(args, "--classes")?.split(",").map((c) => c.trim()).filter(Boolean);
  const result = detectObjects(input, {
    outJsonPath: out,
    classes,
    stride: Number(flag(args, "--stride") ?? 5),
    confidence: Number(flag(args, "--conf") ?? 0.35),
    variant: flag(args, "--variant"),
    forceCpu: has(args, "--cpu"),
    download: has(args, "--no-download") ? "never" : "auto",
  });

  if (has(args, "--json")) { console.log(JSON.stringify(result, null, 2)); return result.ok ? 0 : 1; }
  if (!result.ok) {
    console.error(`detect unavailable: ${result.reason}`);
    return 1;
  }
  const data = result.data!;
  console.log(`detect -> ${out}`);
  console.log(`  ${data.detections} detections over ${data.framesAnalyzed} frames on ${data.device}`);
  console.log(`  labels: ${data.labels.join(", ") || "none"}`);
  if (data.subject) console.log(`  subject: ${data.subject.label} at [${data.subject.box.join(", ")}]`);
  return 0;
}

/** `montara segment` — promptable, tracked masks for rotoscoping. */
export function runSegmentCommand(args: string[]): number {
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error('usage: montara segment <video> [out-mask.mp4] (--box x1,y1,x2,y2 | --point x,y | --auto) [--cpu] [--no-download] [--json]');
    return 1;
  }
  const out = outPath(args[1], join(process.cwd(), "out", "vision", "mask.mp4"));
  const shared = {
    forceCpu: has(args, "--cpu"),
    download: has(args, "--no-download") ? ("never" as const) : ("auto" as const),
  };

  let box: [number, number, number, number] | undefined;
  const boxArg = flag(args, "--box");
  if (boxArg) {
    const parts = boxArg.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      box = [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    }
  }

  const points = flag(args, "--point")?.split(";").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return { x: x ?? 0, y: y ?? 0, label: 1 as const };
  });

  if (!box && !points?.length && has(args, "--auto")) {
    const detection = detectObjects(input, {
      ...shared,
      outJsonPath: join(dirname(out), "detections.json"),
      classes: ["person"],
    });
    const subject: DetectionBox | null | undefined = detection.data?.subject;
    if (!detection.ok || !subject) {
      console.error(`--auto could not find a subject: ${detection.ok ? "no detections" : detection.reason}`);
      return 1;
    }
    box = subject.box;
    console.log(`auto prompt: ${subject.label} at [${box.join(", ")}]`);
  }

  if (!box && !points?.length) {
    console.error("segment needs a prompt: pass --box, --point, or --auto");
    return 1;
  }

  const result = segmentObject(input, {
    ...shared,
    outMattePath: out,
    box,
    points,
    variant: flag(args, "--variant"),
  });

  if (has(args, "--json")) { console.log(JSON.stringify(result, null, 2)); return result.ok ? 0 : 1; }
  if (!result.ok) {
    console.error(`segment unavailable: ${result.reason}`);
    console.error("  run montara models plan to see what this machine can run");
    return 1;
  }
  console.log(`mask -> ${out}`);
  console.log(`  ${result.reason}, ${result.data?.frames_tracked ?? 0} frames tracked`);
  return 0;
}

/** `montara enhance` — noise reduction and voice enhancement, optionally mastered. */
export function runEnhanceCommand(args: string[]): number {
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara enhance <audio|video> [out.wav] [--denoise off|light|medium|strong] [--rnnoise model.rnnn] [--dehum 50|60] [--gate -40] [--no-deess] [--no-compress] [--broadband] [--master] [--json]");
    return 1;
  }
  const out = outPath(args[1], join(process.cwd(), "out", "enhanced.wav"));
  const dehumRaw = flag(args, "--dehum");
  const gateRaw = flag(args, "--gate");
  // Multiband is the default: a single gate and a single denoise strength cannot treat rumble,
  // hum, room tone and hiss at once. `--broadband` keeps the old serial chain for machines whose
  // ffmpeg build has no `acrossover`, and for A/B tests against the previous path.
  const multiband = !has(args, "--broadband");

  const result = restoreVoice(input, out, {
    denoise: (flag(args, "--denoise") as DenoiseLevel | undefined) ?? "medium",
    rnnoiseModel: flag(args, "--rnnoise"),
    dehum: dehumRaw === "50" ? 50 : dehumRaw === "60" ? 60 : false,
    gateDb: gateRaw != null ? Number(gateRaw) : undefined,
    deess: !has(args, "--no-deess"),
    compress: !has(args, "--no-compress"),
    multiband,
  });

  if (!result.ok) {
    console.error(`enhance failed: ${result.error}`);
    return 1;
  }

  if (has(args, "--json")) { console.log(JSON.stringify(result, null, 2)); }
  else {
    console.log(`enhance -> ${out}`);
    if (result.bands?.length) {
      console.log("  bands:");
      for (const line of result.bands) console.log(`    ${line}`);
      console.log(`  tone: ${result.filters.map((f) => f.split("=")[0]).join(" -> ") || "(none)"}`);
    } else {
      console.log(`  chain: ${result.filters.map((f) => f.split("=")[0]).join(" -> ")}`);
    }
    if (result.skipped.length) {
      console.log(`  skipped (not in this ffmpeg build): ${result.skipped.map((f) => f.split("=")[0]).join(", ")}`);
    }
  }

  if (has(args, "--master")) {
    const mastered = out.replace(/\.wav$/i, ".mastered.wav");
    const master = masterAudio(out, mastered, { lufs: -14 });
    if (!master.ok) { console.error(`master failed: ${master.error}`); return 1; }
    console.log(`master -> ${mastered}  ${master.measuredAfter?.toFixed(1) ?? "?"} LUFS`);
  }
  return 0;
}

/** `montara hear` — the documented voice/music analysis entry point. */
export function runHearCommand(args: string[]): number {
  if (args[0] === "stems") return runStemsCommand(args.slice(1));

  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara hear <audio|video> [out.json] [--json]");
    console.error("       montara hear stems <audio|video> [outDir] [--two-stems vocals] [--model htdemucs]");
    return 1;
  }
  const out = outPath(args[1], join(process.cwd(), "out", "hear-scores.json"));
  const music = analyzeMusic(input);
  const voice = measureVoiceQuality(input);
  const scores = { input, generatedAt: new Date().toISOString(), voice, music };

  if (has(args, "--json")) { console.log(JSON.stringify(scores, null, 2)); return 0; }

  writeJson(out, scores);
  console.log(`hear -> ${out}`);
  console.log(`  ${music.durationSec.toFixed(2)}s  mean ${music.loudness.meanDb ?? "?"} dB  peak ${music.loudness.peakDb ?? "?"} dB  ~${music.loudness.approximateLufs ?? "?"} LUFS`);
  console.log(`  voice: pace ${voice.onsetsPerSec.toFixed(2)} onsets/s  warmth ${voice.warmth.toFixed(2)}  ${voice.notes.join("; ")}`);
  for (const gate of music.qualityGates) console.log(`  ${gate.ok ? "ok" : "warn"} ${gate.id}: ${gate.detail}`);
  return 0;
}

/**
 * `montara hear stems` — Demucs source separation.
 *
 * The audio counterpart to `montara matte`: matte splits a picture into subject and background,
 * this splits a mix into vocals / drums / bass / other. Use it when the voice and the bed are
 * already one file — `montara enhance` can only clean a single signal, it cannot unmix one.
 */
function runStemsCommand(args: string[]): number {
  const input = args[0];
  if (!input || !existsSync(input)) {
    console.error("usage: montara hear stems <audio|video> [outDir] [--two-stems vocals] [--model htdemucs]");
    return 1;
  }
  if (!separateStemsAvailable()) {
    console.error("source separation unavailable (pip install demucs). `montara enhance` still cleans a single take.");
    return 1;
  }
  const dir = outPath(args[1], join(process.cwd(), "out", "stems"));
  const twoStems = flag(args, "--two-stems");
  const model = flag(args, "--model") ?? "htdemucs";

  console.log(`separating with ${model}${twoStems ? ` (two-stem: ${twoStems})` : ""} — CPU separation takes a few minutes, and the first run downloads weights…`);
  const result = separateStems(input, dir, { model, twoStems });
  if (!result) { console.error("separation failed"); return 1; }

  const names = Object.keys(result.stems);
  console.log(`stems -> ${dir}  (${names.length}: ${names.join(", ")} @ ${result.samplerate} Hz)`);
  for (const [name, path] of Object.entries(result.stems)) console.log(`  ${name.padEnd(10)} ${path}`);
  if (has(args, "--json")) console.log(JSON.stringify(result, null, 2));
  return 0;
}

const CUT_USAGE = `usage: montara cut <ir.json> <operation> [args] [--out path]

  split      <clipId> <atSec>              cut a clip in two at an absolute timeline second
  ripple     <clipId>                      delete a clip and pull everything after it back
  trim       <clipId> <deltaSec>           trim the out point and ripple the difference
  roll       <leftId> <rightId> <deltaSec> move the edit point between two clips
  slip       <clipId> <deltaSec>           change what a clip shows without moving it
  slide      <clipId> <deltaSec>           move a clip and absorb the shift into its neighbours
  jcut       <audioClipId> <leadSec>       bring audio in early under the outgoing shot
  lcut       <audioClipId> <tailSec>       hold audio over the incoming shot
  crossfade  <leftId> <rightId> <sec>      overlap two clips with a dissolve
  gaps       <trackId>                     list gaps on a track
  close      <trackId>                     pull clips together to remove gaps`;

/** `montara cut` — editorial operations on a Timeline IR, in place or to a new file. */
export function runCutCommand(args: string[]): number {
  const irPath = args[0];
  const op = args[1];
  if (!irPath || !existsSync(irPath) || !op) {
    console.error(CUT_USAGE);
    return 1;
  }

  const timeline = JSON.parse(readFileSync(irPath, "utf8")) as Timeline;
  const rest = args.slice(2).filter((a) => !a.startsWith("--"));
  const num = (index: number): number => Number(rest[index]);

  if (op === "gaps") {
    const trackId = rest[0];
    if (!trackId) { console.error(CUT_USAGE); return 1; }
    const gaps = findGaps(timeline, trackId);
    if (has(args, "--json")) { console.log(JSON.stringify(gaps, null, 2)); return 0; }
    if (!gaps.length) { console.log(`no gaps on track ${trackId}`); return 0; }
    for (const gap of gaps) console.log(`  gap ${gap.startSec}s -> ${gap.endSec}s (${(gap.endSec - gap.startSec).toFixed(3)}s)`);
    return 0;
  }

  let next: Timeline;
  switch (op) {
    case "split": next = splitClip(timeline, rest[0]!, num(1)); break;
    case "ripple": next = rippleDelete(timeline, rest[0]!); break;
    case "trim": next = rippleTrim(timeline, rest[0]!, num(1)); break;
    case "roll": next = rollEdit(timeline, rest[0]!, rest[1]!, num(2)); break;
    case "slip": next = slipClip(timeline, rest[0]!, num(1)); break;
    case "slide": next = slideClip(timeline, rest[0]!, num(1)); break;
    case "jcut": next = jCut(timeline, rest[0]!, num(1)); break;
    case "lcut": next = lCut(timeline, rest[0]!, num(1)); break;
    case "crossfade": next = crossfade(timeline, rest[0]!, rest[1]!, num(2)); break;
    case "close": next = closeGaps(timeline, rest[0]!); break;
    default:
      console.error(`unknown cut operation '${op}'\n\n${CUT_USAGE}`);
      return 1;
  }

  // An edit that produces an invalid IR is a bug, not an output: refuse before overwriting.
  const issues = validateTimeline(next);
  if (issues.length) {
    console.error(`cut '${op}' produced an invalid timeline; nothing was written:`);
    for (const issue of issues) console.error(`  ${issue}`);
    return 1;
  }

  const out = flag(args, "--out") ?? irPath;
  writeJson(out, next);
  console.log(`cut ${op} -> ${out}`);
  return 0;
}
