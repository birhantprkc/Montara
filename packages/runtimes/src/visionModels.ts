// @montara/runtimes - hardware-gated vision model selection.
//
// Every matting/segmentation/detection model ships in several sizes. This module picks the
// strongest variant the current machine can actually run and refuses to approve a download
// otherwise. Weights are external assets: nothing here fetches them, it only decides whether
// fetching is allowed and which variant to ask for.

import type { HardwareProfile } from "./hardware";

export type VisionModelFamily = "rvm" | "sam2" | "yolo";
export type VisionDevice = "cuda" | "mps" | "rocm" | "cpu";

export interface VisionModelVariant {
  id: string;
  family: VisionModelFamily;
  name: string;
  /** VRAM needed to run on an accelerator, MB. */
  minVramMb: number;
  /** System RAM needed for the CPU path, MB. Only meaningful when `cpuViable`. */
  minRamMb: number;
  /** Approximate weight download size, MB. */
  downloadMb: number;
  /** Whether this variant is fast enough on CPU to be worth offering. */
  cpuViable: boolean;
  /** Higher = better output. Used to prefer the strongest runnable variant. */
  capability: number;
  license: string;
  sourceUrl: string;
  purpose: string;
}

/**
 * Ordered weakest-to-strongest within each family. Requirements are deliberately
 * conservative: a model that swaps or OOMs mid-render is worse than one we declined.
 */
export const VISION_MODELS: VisionModelVariant[] = [
  {
    id: "rvm-mobilenetv3",
    family: "rvm",
    name: "Robust Video Matting (MobileNetV3)",
    minVramMb: 1536,
    minRamMb: 4096,
    downloadMb: 15,
    cpuViable: true,
    capability: 1,
    license: "GPL-3.0 (weights carry their own model card)",
    sourceUrl: "https://github.com/PeterL1n/RobustVideoMatting",
    purpose: "Real-time background matting without a green screen. The CPU-friendly default.",
  },
  {
    id: "rvm-resnet50",
    family: "rvm",
    name: "Robust Video Matting (ResNet50)",
    minVramMb: 4096,
    minRamMb: 16384,
    downloadMb: 105,
    cpuViable: false,
    capability: 2,
    license: "GPL-3.0 (weights carry their own model card)",
    sourceUrl: "https://github.com/PeterL1n/RobustVideoMatting",
    purpose: "Higher-fidelity hair and edge detail for hero shots. Needs a real GPU.",
  },
  {
    id: "sam2.1-hiera-tiny",
    family: "sam2",
    name: "SAM 2.1 Hiera Tiny",
    minVramMb: 2048,
    minRamMb: 8192,
    downloadMb: 150,
    cpuViable: true,
    capability: 1,
    license: "Apache-2.0",
    sourceUrl: "https://github.com/facebookresearch/sam2",
    purpose: "Promptable object segmentation with video tracking. Smallest usable tier.",
  },
  {
    id: "sam2.1-hiera-small",
    family: "sam2",
    name: "SAM 2.1 Hiera Small",
    minVramMb: 3072,
    minRamMb: 12288,
    downloadMb: 185,
    cpuViable: false,
    capability: 2,
    license: "Apache-2.0",
    sourceUrl: "https://github.com/facebookresearch/sam2",
    purpose: "Better mask boundaries than tiny at a modest VRAM increase.",
  },
  {
    id: "sam2.1-hiera-base-plus",
    family: "sam2",
    name: "SAM 2.1 Hiera Base+",
    minVramMb: 6144,
    minRamMb: 16384,
    downloadMb: 320,
    cpuViable: false,
    capability: 3,
    license: "Apache-2.0",
    sourceUrl: "https://github.com/facebookresearch/sam2",
    purpose: "Production rotoscoping quality with stable multi-object tracking.",
  },
  {
    id: "sam2.1-hiera-large",
    family: "sam2",
    name: "SAM 2.1 Hiera Large",
    minVramMb: 10240,
    minRamMb: 32768,
    downloadMb: 900,
    cpuViable: false,
    capability: 4,
    license: "Apache-2.0",
    sourceUrl: "https://github.com/facebookresearch/sam2",
    purpose: "Best available mask fidelity for finishing work.",
  },
  {
    id: "yolo11n",
    family: "yolo",
    name: "YOLO11 Nano",
    minVramMb: 1024,
    minRamMb: 2048,
    downloadMb: 6,
    cpuViable: true,
    capability: 1,
    license: "AGPL-3.0 (Ultralytics) - commercial use requires their licence",
    sourceUrl: "https://github.com/ultralytics/ultralytics",
    purpose: "Subject and object detection to seed masks and auto-framing. Runs anywhere.",
  },
  {
    id: "yolo11s",
    family: "yolo",
    name: "YOLO11 Small",
    minVramMb: 2048,
    minRamMb: 4096,
    downloadMb: 22,
    cpuViable: true,
    capability: 2,
    license: "AGPL-3.0 (Ultralytics) - commercial use requires their licence",
    sourceUrl: "https://github.com/ultralytics/ultralytics",
    purpose: "Noticeably better small-object recall while still CPU-viable.",
  },
  {
    id: "yolo11m",
    family: "yolo",
    name: "YOLO11 Medium",
    minVramMb: 4096,
    minRamMb: 12288,
    downloadMb: 40,
    cpuViable: false,
    capability: 3,
    license: "AGPL-3.0 (Ultralytics) - commercial use requires their licence",
    sourceUrl: "https://github.com/ultralytics/ultralytics",
    purpose: "Balanced accuracy for crowded scenes.",
  },
  {
    id: "yolo11x",
    family: "yolo",
    name: "YOLO11 Extra Large",
    minVramMb: 8192,
    minRamMb: 32768,
    downloadMb: 114,
    cpuViable: false,
    capability: 4,
    license: "AGPL-3.0 (Ultralytics) - commercial use requires their licence",
    sourceUrl: "https://github.com/ultralytics/ultralytics",
    purpose: "Highest detection accuracy for finishing passes.",
  },
];

export interface RejectedVariant {
  id: string;
  reason: string;
}

export interface VisionModelSelection {
  family: VisionModelFamily;
  /** The variant to use, or undefined when this machine cannot run any of them. */
  chosen?: VisionModelVariant;
  /** Device the chosen variant should execute on. */
  device: VisionDevice;
  /**
   * True only when a variant fits AND there is room on disk. The download step must
   * check this flag - a false value means "do not fetch weights on this machine".
   */
  downloadApproved: boolean;
  reason: string;
  rejected: RejectedVariant[];
}

/** Headroom kept free so a download cannot fill the user's disk. */
const DISK_HEADROOM_MB = 2048;

function variantsFor(family: VisionModelFamily): VisionModelVariant[] {
  return VISION_MODELS.filter((model) => model.family === family).sort((a, b) => b.capability - a.capability);
}

export interface VisionModelSelectOptions {
  /** Pin a specific variant id. Still refused if the machine cannot run it. */
  preferId?: string;
  /** Ignore accelerators and evaluate the CPU path only. */
  forceCpu?: boolean;
}

/**
 * Pick the strongest variant this machine can run.
 *
 * A GPU variant qualifies when the accelerator has enough VRAM. Otherwise the variant only
 * qualifies if it is CPU-viable and there is enough system RAM. When nothing qualifies the
 * selection comes back empty with `downloadApproved: false` - callers must then degrade
 * rather than fetch weights that would fail or thrash.
 */
export function selectVisionModel(
  family: VisionModelFamily,
  hardware: HardwareProfile,
  opts: VisionModelSelectOptions = {},
): VisionModelSelection {
  const accelerator = opts.forceCpu ? { kind: "cpu" as const, vramMb: 0 } : hardware.accelerator;
  const onGpu = accelerator.kind !== "cpu";
  const candidates = variantsFor(family);
  const pool = opts.preferId ? candidates.filter((model) => model.id === opts.preferId) : candidates;
  const rejected: RejectedVariant[] = [];

  if (opts.preferId && !pool.length) {
    return {
      family,
      device: "cpu",
      downloadApproved: false,
      reason: `unknown ${family} variant "${opts.preferId}"`,
      rejected: candidates.map((model) => ({ id: model.id, reason: "not the requested variant" })),
    };
  }

  for (const model of pool) {
    if (onGpu) {
      if (accelerator.vramMb >= model.minVramMb) {
        return approve(model, accelerator.kind as VisionDevice, hardware, rejected);
      }
      rejected.push({
        id: model.id,
        reason: `needs ${model.minVramMb} MB VRAM, device has ${accelerator.vramMb} MB`,
      });
      continue;
    }
    if (!model.cpuViable) {
      rejected.push({ id: model.id, reason: "not viable on CPU; requires an accelerator" });
      continue;
    }
    if (hardware.ramMb < model.minRamMb) {
      rejected.push({ id: model.id, reason: `needs ${model.minRamMb} MB RAM, machine has ${hardware.ramMb} MB` });
      continue;
    }
    return approve(model, "cpu", hardware, rejected);
  }

  return {
    family,
    device: onGpu ? (accelerator.kind as VisionDevice) : "cpu",
    downloadApproved: false,
    reason: `no ${family} variant can run on this machine; skipping download`,
    rejected,
  };
}

function approve(
  model: VisionModelVariant,
  device: VisionDevice,
  hardware: HardwareProfile,
  rejected: RejectedVariant[],
): VisionModelSelection {
  const diskKnown = hardware.freeDiskMb >= 0;
  const diskOk = !diskKnown || hardware.freeDiskMb >= model.downloadMb + DISK_HEADROOM_MB;
  if (!diskOk) {
    return {
      family: model.family,
      chosen: model,
      device,
      downloadApproved: false,
      reason: `${model.name} fits in memory but needs ${model.downloadMb} MB plus ${DISK_HEADROOM_MB} MB headroom; only ${hardware.freeDiskMb} MB free`,
      rejected,
    };
  }
  return {
    family: model.family,
    chosen: model,
    device,
    downloadApproved: true,
    reason: `${model.name} on ${device}`,
    rejected,
  };
}

export interface VisionModelPlan {
  generatedAt: string;
  hardware: string;
  selections: VisionModelSelection[];
  /** Families this machine cannot serve at all. */
  unavailable: VisionModelFamily[];
  notes: string[];
}

const FAMILIES: VisionModelFamily[] = ["rvm", "sam2", "yolo"];

/** Full gating decision across every family, for `montara models plan` and doctor. */
export function planVisionModels(
  hardware: HardwareProfile,
  opts: VisionModelSelectOptions = {},
): VisionModelPlan {
  const selections = FAMILIES.map((family) => selectVisionModel(family, hardware, opts));
  return {
    generatedAt: new Date().toISOString(),
    hardware: `${hardware.platform}/${hardware.arch} ${hardware.accelerator.name} ${hardware.accelerator.vramMb}MB VRAM ${hardware.ramMb}MB RAM`,
    selections,
    unavailable: selections.filter((s) => !s.downloadApproved).map((s) => s.family),
    notes: [
      "Weights are external assets under their own licences and are never committed to this repo.",
      "A family with downloadApproved=false must degrade, not download.",
      "Ultralytics YOLO is AGPL-3.0: commercial use needs a licence from Ultralytics.",
    ],
  };
}

export function getVisionModel(id: string): VisionModelVariant | undefined {
  return VISION_MODELS.find((model) => model.id === id);
}

export function listVisionModels(family?: VisionModelFamily): VisionModelVariant[] {
  return family ? variantsFor(family) : [...VISION_MODELS];
}
