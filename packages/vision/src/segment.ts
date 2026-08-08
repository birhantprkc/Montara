// @montara/vision - promptable, tracked segmentation with SAM 2.
//
// RVM answers "subject vs background". SAM 2 answers "that object, specifically", and
// keeps the answer stable across the shot - the basis for professional rotoscoping.

import { existsSync } from "node:fs";
import {
  probeHardware,
  selectVisionModel,
  type HardwareProfile,
} from "../../runtimes/src/index";
import { reconcileHardware } from "./device";
import { runVisionWorker } from "./worker";
import type { VisionRunResult } from "./matte";

export interface SegmentPoint {
  x: number;
  y: number;
  /** 1 keeps the region, 0 excludes it. */
  label?: 0 | 1;
}

export interface SegmentData {
  input: string;
  variant: string;
  device: string;
  frames_tracked: number;
  width: number;
  height: number;
  fps: number;
  matte: string;
}

export interface SegmentOptions {
  /** Grayscale mask MP4 to write. */
  outMattePath: string;
  /** Click prompts in source pixels. */
  points?: SegmentPoint[];
  /** Box prompt [x1, y1, x2, y2] in source pixels - a YOLO subject box drops straight in. */
  box?: [number, number, number, number];
  objectId?: number;
  variant?: string;
  forceCpu?: boolean;
  download?: "auto" | "never";
  maxFrames?: number;
  projectRoot?: string;
  hardware?: HardwareProfile;
  timeoutMs?: number;
}

export function segmentObject(input: string, opts: SegmentOptions): VisionRunResult<SegmentData> {
  const machine = opts.hardware ?? probeHardware();

  if (!existsSync(input)) {
    return { ok: false, unavailable: false, reason: `input not found: ${input}`, hardware: machine, artifacts: [] };
  }
  if (!opts.points?.length && !opts.box) {
    return {
      ok: false,
      unavailable: false,
      reason: "SAM 2 needs a prompt: pass points or a box",
      hardware: machine,
      artifacts: [],
    };
  }

  const reconciled = opts.forceCpu ? { hardware: machine, forceCpu: true } : reconcileHardware("sam2", machine, opts.projectRoot);
  const hardware = reconciled.hardware;

  const selection = selectVisionModel("sam2", hardware, {
    preferId: opts.variant,
    forceCpu: reconciled.forceCpu || opts.forceCpu,
  });
  if (!selection.chosen) {
    return { ok: false, unavailable: true, reason: selection.reason, hardware, selection, artifacts: [] };
  }

  const args = [
    "--input", input,
    "--out-matte", opts.outMattePath,
    "--variant", selection.chosen.id,
    "--device", selection.device,
    "--obj-id", String(opts.objectId ?? 1),
  ];
  if (opts.points?.length) {
    args.push("--points", opts.points.map((p) => `${p.x},${p.y},${p.label ?? 1}`).join(";"));
  }
  if (opts.box) args.push("--box", opts.box.join(","));
  if (opts.maxFrames) args.push("--max-frames", String(opts.maxFrames));
  if (opts.download !== "never" && selection.downloadApproved) args.push("--allow-download");

  const outcome = runVisionWorker<SegmentData>({
    runtimeId: "sam2",
    script: "sam2_segment.py",
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
