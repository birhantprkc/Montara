// @montara/vision - background matting without a green screen.
//
// The gate lives here: we probe the machine, pick the strongest RVM variant it can run,
// and only then invoke the worker. If no variant fits we return unavailable and no weights
// are fetched - the caller degrades to the chromakey path or renders the clip opaque.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  probeHardware,
  selectVisionModel,
  type HardwareProfile,
  type VisionModelSelection,
} from "../../runtimes/src/index";
import { mediaBin } from "../../render-ffmpeg/src/index";
import { reconcileHardware } from "./device";
import { runVisionWorker } from "./worker";

export interface VisionRunResult<T> {
  ok: boolean;
  /** True when this machine cannot run the model. Callers must degrade, not fail. */
  unavailable: boolean;
  reason: string;
  hardware: HardwareProfile;
  selection?: VisionModelSelection;
  data?: T;
  artifacts: string[];
}

export interface MatteData {
  input: string;
  variant: string;
  device: string;
  frames: number;
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  fps: number;
  matte: string;
  foreground: string | null;
}

export interface MatteOptions {
  /** Grayscale alpha matte MP4 to write. */
  outMattePath: string;
  /** Optional RGB foreground MP4 with the background suppressed. */
  outForegroundPath?: string;
  /** Pin a variant id. Still refused when the machine cannot run it. */
  variant?: string;
  /** Evaluate the CPU path only, ignoring any accelerator. */
  forceCpu?: boolean;
  /** "never" forbids all weight downloads; "auto" downloads only when the gate approves. */
  download?: "auto" | "never";
  maxFrames?: number;
  /** Cap the matte width. Defaults to 1920: 4K alpha costs a lot of pipe and buys nothing. */
  maxWidth?: number;
  projectRoot?: string;
  hardware?: HardwareProfile;
  timeoutMs?: number;
}

/**
 * Produce a temporally coherent alpha matte for `input` using Robust Video Matting.
 *
 * Returns `unavailable` (never throws) when this machine has no runnable variant, so a
 * render can continue without matting rather than dying on a missing model.
 */
export function removeBackground(input: string, opts: MatteOptions): VisionRunResult<MatteData> {
  const machine = opts.hardware ?? probeHardware();

  if (!existsSync(input)) {
    return { ok: false, unavailable: false, reason: `input not found: ${input}`, hardware: machine, artifacts: [] };
  }

  // A GPU the interpreter cannot reach must not influence which variant we pick.
  const reconciled = opts.forceCpu ? { hardware: machine, forceCpu: true } : reconcileHardware("rvm", machine, opts.projectRoot);
  const hardware = reconciled.hardware;

  const selection = selectVisionModel("rvm", hardware, {
    preferId: opts.variant,
    forceCpu: reconciled.forceCpu || opts.forceCpu,
  });
  if (!selection.chosen) {
    return { ok: false, unavailable: true, reason: selection.reason, hardware, selection, artifacts: [] };
  }

  const allowDownload = opts.download !== "never" && selection.downloadApproved;
  const args = [
    "--input", input,
    "--out-matte", opts.outMattePath,
    "--variant", selection.chosen.id,
    "--device", selection.device,
  ];
  if (opts.outForegroundPath) args.push("--out-foreground", opts.outForegroundPath);
  if (opts.maxFrames) args.push("--max-frames", String(opts.maxFrames));
  if (opts.maxWidth != null) args.push("--max-width", String(Math.max(0, Math.round(opts.maxWidth))));
  if (allowDownload) args.push("--allow-download");

  const outcome = runVisionWorker<MatteData>({
    runtimeId: "rvm",
    script: "rvm_matte.py",
    args,
    projectRoot: opts.projectRoot,
    timeoutMs: opts.timeoutMs,
  });

  return {
    ok: outcome.ok,
    unavailable: outcome.unavailable,
    reason: outcome.ok ? `${selection.chosen.name} on ${selection.device}` : outcome.error,
    hardware,
    selection,
    data: outcome.data,
    artifacts: outcome.artifacts,
  };
}

export interface ChromakeyMatteOptions {
  /** Key colour, hex without '#'. Defaults to standard green screen. */
  color?: string;
  /** 0..1 colour distance treated as background. */
  similarity?: number;
  /** 0..1 edge blend. */
  blend?: number;
}

/**
 * Zero-dependency fallback: derive an alpha matte from an actual green/blue screen.
 *
 * This is only correct when the footage really was shot on a screen. It exists so a
 * machine that cannot run RVM still has a real matting path rather than nothing.
 */
export function chromakeyMatte(
  input: string,
  outMattePath: string,
  opts: ChromakeyMatteOptions = {},
): { ok: boolean; outPath: string; error?: string } {
  const color = (opts.color ?? "00ff00").replace(/^#/, "");
  const similarity = opts.similarity ?? 0.25;
  const blend = opts.blend ?? 0.05;
  mkdirSync(dirname(outMattePath), { recursive: true });

  const result = spawnSync(mediaBin("ffmpeg"), [
    "-y", "-v", "error",
    "-i", input,
    "-vf", `chromakey=0x${color}:${similarity}:${blend},alphaextract,format=gray`,
    "-an",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18",
    outMattePath,
  ], { encoding: "utf8", maxBuffer: 1 << 26 });

  if (result.status !== 0) {
    return { ok: false, outPath: outMattePath, error: (result.stderr || "").slice(-500) };
  }
  return { ok: true, outPath: outMattePath };
}
