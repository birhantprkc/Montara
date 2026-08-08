// @montara/vision - local matting, segmentation, and detection with a hardware gate.
//
// Nothing in this package downloads a model that the current machine cannot run. Every
// entry point probes the hardware, picks the strongest runnable variant, and returns an
// honest `unavailable` result when there isn't one.

import { join } from "node:path";
import { probeHardware, type HardwareProfile } from "../../runtimes/src/index";
import { chromakeyMatte, removeBackground, type MatteData, type VisionRunResult } from "./matte";
import { detectObjects } from "./detect";
import { segmentObject } from "./segment";

export {
  removeBackground,
  chromakeyMatte,
  type ChromakeyMatteOptions,
  type MatteData,
  type MatteOptions,
  type VisionRunResult,
} from "./matte";
export { segmentObject, type SegmentData, type SegmentOptions, type SegmentPoint } from "./segment";
export { detectObjects, type DetectData, type DetectionBox, type DetectOptions } from "./detect";
export {
  probeRuntimeDevices,
  reconcileHardware,
  resetRuntimeDeviceCache,
  type RuntimeDevices,
} from "./device";
export { resolvePython, runVisionWorker, visionScript, type WorkerOutcome } from "./worker";

export type MatteStrategy = "rvm" | "detect-segment" | "chromakey" | "none";

export interface AutoMatteResult {
  ok: boolean;
  strategy: MatteStrategy;
  mattePath?: string;
  reason: string;
  hardware: HardwareProfile;
  /** What each strategy reported, so the CLI can explain why it landed where it did. */
  attempts: { strategy: MatteStrategy; ok: boolean; reason: string }[];
  artifacts: string[];
}

export interface AutoMatteOptions {
  outMattePath: string;
  /** Working directory for intermediate artifacts (detections JSON). */
  workDir?: string;
  forceCpu?: boolean;
  download?: "auto" | "never";
  maxFrames?: number;
  /** Cap the matte width. Defaults to 1920 inside the RVM worker. */
  maxWidth?: number;
  projectRoot?: string;
  hardware?: HardwareProfile;
  /** Pin the RVM variant. Still refused when the machine cannot run it. */
  variant?: string;
  /** Try the green-screen key when no model is runnable. Off by default: it needs a real screen. */
  allowChromakeyFallback?: boolean;
  chromakeyColor?: string;
}

/**
 * Best available matte for a clip, degrading in quality order.
 *
 * RVM first (purpose-built and temporally stable), then YOLO-seeded SAM 2 (works on any
 * subject but heavier), then an optional chromakey. When every path is closed we say so
 * instead of failing, and the render proceeds with the clip opaque.
 */
export function autoMatte(input: string, opts: AutoMatteOptions): AutoMatteResult {
  const hardware = opts.hardware ?? probeHardware();
  const attempts: AutoMatteResult["attempts"] = [];
  const shared = {
    forceCpu: opts.forceCpu,
    download: opts.download,
    maxFrames: opts.maxFrames,
    projectRoot: opts.projectRoot,
    hardware,
  };

  const matte: VisionRunResult<MatteData> = removeBackground(input, {
    ...shared,
    outMattePath: opts.outMattePath,
    variant: opts.variant,
    maxWidth: opts.maxWidth,
  });
  attempts.push({ strategy: "rvm", ok: matte.ok, reason: matte.reason });
  if (matte.ok) {
    return {
      ok: true,
      strategy: "rvm",
      mattePath: opts.outMattePath,
      reason: matte.reason,
      hardware,
      attempts,
      artifacts: matte.artifacts,
    };
  }

  const workDir = opts.workDir ?? join(process.cwd(), "out", "vision");
  const detection = detectObjects(input, { ...shared, outJsonPath: join(workDir, "detections.json") });
  if (detection.ok && detection.data?.subject) {
    const segmented = segmentObject(input, {
      ...shared,
      outMattePath: opts.outMattePath,
      box: detection.data.subject.box,
    });
    attempts.push({ strategy: "detect-segment", ok: segmented.ok, reason: segmented.reason });
    if (segmented.ok) {
      return {
        ok: true,
        strategy: "detect-segment",
        mattePath: opts.outMattePath,
        reason: `${detection.reason} -> ${segmented.reason}`,
        hardware,
        attempts,
        artifacts: [...detection.artifacts, ...segmented.artifacts],
      };
    }
  } else {
    attempts.push({
      strategy: "detect-segment",
      ok: false,
      reason: detection.ok ? "no subject detected to seed SAM 2" : detection.reason,
    });
  }

  if (opts.allowChromakeyFallback) {
    const keyed = chromakeyMatte(input, opts.outMattePath, { color: opts.chromakeyColor });
    attempts.push({ strategy: "chromakey", ok: keyed.ok, reason: keyed.error ?? "chromakey matte" });
    if (keyed.ok) {
      return {
        ok: true,
        strategy: "chromakey",
        mattePath: opts.outMattePath,
        reason: "keyed from a green/blue screen; no learned model was runnable here",
        hardware,
        attempts,
        artifacts: [opts.outMattePath],
      };
    }
  }

  return {
    ok: false,
    strategy: "none",
    reason: "no matting path is available on this machine; the clip will render opaque",
    hardware,
    attempts,
    artifacts: [],
  };
}
