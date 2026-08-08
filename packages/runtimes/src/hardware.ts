// @montara/runtimes - local hardware capability probe.
//
// Model gating starts here: we measure what this machine can actually run before any
// weights are fetched. Probes are cheap, never throw, and degrade to a CPU-only profile
// when a vendor tool is missing. Nothing here downloads or installs.

import { spawnSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { cpus, totalmem } from "node:os";

export type AcceleratorKind = "cuda" | "mps" | "rocm" | "cpu";

export interface AcceleratorInfo {
  kind: AcceleratorKind;
  name: string;
  /** Dedicated VRAM in MB. For unified-memory (Apple) this is the budget we allow a model. */
  vramMb: number;
  /** True when the accelerator was detected by a vendor tool rather than assumed. */
  detected: boolean;
}

export interface HardwareProfile {
  generatedAt: string;
  platform: string;
  arch: string;
  cpuCores: number;
  ramMb: number;
  /** Free space on the runtime workspace volume, MB. -1 when it could not be read. */
  freeDiskMb: number;
  accelerator: AcceleratorInfo;
  notes: string[];
}

const CPU_ONLY: AcceleratorInfo = { kind: "cpu", name: "CPU", vramMb: 0, detected: true };

function capture(command: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 8000,
    shell: process.platform === "win32" && !command.toLowerCase().endsWith(".exe"),
  });
  if (result.status !== 0) return { ok: false, stdout: "" };
  return { ok: true, stdout: (result.stdout || "").trim() };
}

/** Largest NVIDIA device reported by nvidia-smi, or null when the tool is absent. */
function probeCuda(): AcceleratorInfo | null {
  const result = capture("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  if (!result.ok || !result.stdout) return null;
  let best: AcceleratorInfo | null = null;
  for (const line of result.stdout.split(/\r?\n/)) {
    const [rawName, rawVram] = line.split(",").map((part) => part.trim());
    const vramMb = Number.parseInt(rawVram ?? "", 10);
    if (!rawName || !Number.isFinite(vramMb)) continue;
    if (!best || vramMb > best.vramMb) best = { kind: "cuda", name: rawName, vramMb, detected: true };
  }
  return best;
}

function probeRocm(): AcceleratorInfo | null {
  const result = capture("rocm-smi", ["--showmeminfo", "vram", "--csv"]);
  if (!result.ok || !result.stdout) return null;
  const match = result.stdout.match(/(\d{3,})/);
  if (!match?.[1]) return null;
  const bytes = Number.parseInt(match[1], 10);
  const vramMb = bytes > 1 << 20 ? Math.round(bytes / (1024 * 1024)) : bytes;
  return { kind: "rocm", name: "AMD ROCm device", vramMb, detected: true };
}

/**
 * Apple Silicon shares one memory pool between CPU and GPU. We budget half of system RAM
 * as the usable model working set so a large model cannot starve the rest of the machine.
 */
function probeMetal(ramMb: number): AcceleratorInfo | null {
  if (process.platform !== "darwin" || process.arch !== "arm64") return null;
  return { kind: "mps", name: "Apple Silicon (unified memory)", vramMb: Math.floor(ramMb / 2), detected: true };
}

function freeDiskMb(path: string): number {
  try {
    const stats = statfsSync(path);
    return Math.floor((Number(stats.bavail) * Number(stats.bsize)) / (1024 * 1024));
  } catch {
    return -1;
  }
}

export interface HardwareProbeOptions {
  /** Volume to measure free space on. Defaults to the current working directory. */
  diskPath?: string;
  /** Skip accelerator detection and report a CPU-only machine. */
  forceCpu?: boolean;
}

/** Measure this machine. Never throws; missing vendor tools simply mean "cpu". */
export function probeHardware(opts: HardwareProbeOptions = {}): HardwareProfile {
  const ramMb = Math.floor(totalmem() / (1024 * 1024));
  const notes: string[] = [];
  const accelerator = opts.forceCpu
    ? CPU_ONLY
    : probeCuda() ?? probeRocm() ?? probeMetal(ramMb) ?? CPU_ONLY;

  if (accelerator.kind === "cpu") {
    notes.push("No GPU detected. Only CPU-viable model variants will be offered.");
  }
  if (accelerator.kind === "mps") {
    notes.push("Apple unified memory: half of system RAM is budgeted as the model working set.");
  }

  const disk = freeDiskMb(opts.diskPath ?? process.cwd());
  if (disk < 0) notes.push("Free disk space could not be read; download size checks are skipped.");

  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    cpuCores: cpus().length || 1,
    ramMb,
    freeDiskMb: disk,
    accelerator,
    notes,
  };
}

/** One-line summary for CLI output and doctor reports. */
export function describeHardware(profile: HardwareProfile): string {
  const accel = profile.accelerator.kind === "cpu"
    ? "CPU only"
    : `${profile.accelerator.name} (${profile.accelerator.vramMb} MB)`;
  return `${profile.platform}/${profile.arch} · ${profile.cpuCores} cores · ${profile.ramMb} MB RAM · ${accel}`;
}
