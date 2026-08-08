// @montara/vision - subject and object detection.
//
// Detections seed SAM 2 prompts and drive auto-framing. Same gate as everywhere else:
// no runnable variant means no download and an honest unavailable result.

import { existsSync } from "node:fs";
import {
  probeHardware,
  selectVisionModel,
  type HardwareProfile,
} from "../../runtimes/src/index";
import { reconcileHardware } from "./device";
import { runVisionWorker } from "./worker";
import type { VisionRunResult } from "./matte";

export interface DetectionBox {
  label: string;
  /** [x1, y1, x2, y2] in source pixels. */
  box: [number, number, number, number];
  confidence: number;
}

export interface DetectData {
  input: string;
  variant: string;
  device: string;
  framesAnalyzed: number;
  detections: number;
  /** The box a viewer would call "the subject", or null when nothing was found. */
  subject: DetectionBox | null;
  labels: string[];
}

export interface DetectOptions {
  outJsonPath: string;
  variant?: string;
  forceCpu?: boolean;
  download?: "auto" | "never";
  /** Minimum confidence to keep a detection. */
  confidence?: number;
  /** Analyse every Nth frame. Detection rarely needs every frame. */
  stride?: number;
  maxFrames?: number;
  /** Keep only these class names (e.g. ["person"]). */
  classes?: string[];
  projectRoot?: string;
  hardware?: HardwareProfile;
  timeoutMs?: number;
}

export function detectObjects(input: string, opts: DetectOptions): VisionRunResult<DetectData> {
  const machine = opts.hardware ?? probeHardware();

  if (!existsSync(input)) {
    return { ok: false, unavailable: false, reason: `input not found: ${input}`, hardware: machine, artifacts: [] };
  }

  const reconciled = opts.forceCpu ? { hardware: machine, forceCpu: true } : reconcileHardware("yolo", machine, opts.projectRoot);
  const hardware = reconciled.hardware;

  const selection = selectVisionModel("yolo", hardware, {
    preferId: opts.variant,
    forceCpu: reconciled.forceCpu || opts.forceCpu,
  });
  if (!selection.chosen) {
    return { ok: false, unavailable: true, reason: selection.reason, hardware, selection, artifacts: [] };
  }

  const args = [
    "--input", input,
    "--out-json", opts.outJsonPath,
    "--variant", selection.chosen.id,
    "--device", selection.device,
    "--conf", String(opts.confidence ?? 0.35),
    "--stride", String(opts.stride ?? 5),
  ];
  if (opts.maxFrames) args.push("--max-frames", String(opts.maxFrames));
  if (opts.classes?.length) args.push("--classes", opts.classes.join(","));
  if (opts.download !== "never" && selection.downloadApproved) args.push("--allow-download");

  const outcome = runVisionWorker<DetectData>({
    runtimeId: "yolo",
    script: "yolo_detect.py",
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
