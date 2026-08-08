// @montara/vision - reconcile the machine probe with what the Python runtime can drive.
//
// `probeHardware()` answers "does this box have a GPU?" by asking vendor tools. The gate
// needs a different answer: "can the interpreter that will run the model use that GPU?"
// A CPU-only torch wheel on a CUDA laptop makes those two disagree, and believing the
// vendor tool means picking a heavy variant that then runs at a crawl on the CPU.
//
// So we ask torch once, cache it for the process, and downgrade the profile when the
// accelerator is unreachable. This never downloads anything.

import type { AcceleratorKind, HardwareProfile, RuntimeId } from "../../runtimes/src/index";
import { runVisionWorker } from "./worker";

export interface RuntimeDevices {
  /** True when the probe itself ran. False means torch is missing entirely. */
  probed: boolean;
  interpreter: string;
  torch: string;
  devices: AcceleratorKind[];
  vramMb: number;
  deviceName: string;
  reason: string;
}

interface ProbePayload {
  interpreter?: string;
  torch?: string;
  devices?: string[];
  vramMb?: number;
  deviceName?: string;
}

const CACHE = new Map<string, RuntimeDevices>();

/** Ask a runtime's interpreter which torch devices it can actually use. Memoised per process. */
export function probeRuntimeDevices(runtimeId: RuntimeId, projectRoot?: string): RuntimeDevices {
  const key = `${runtimeId}:${projectRoot ?? process.cwd()}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const outcome = runVisionWorker<ProbePayload>({
    runtimeId,
    script: "probe_device.py",
    args: [],
    projectRoot,
    timeoutMs: 120_000,
  });

  const kinds = new Set<AcceleratorKind>(["cpu"]);
  for (const d of outcome.data?.devices ?? []) {
    if (d === "cuda" || d === "mps" || d === "rocm" || d === "cpu") kinds.add(d);
  }

  const result: RuntimeDevices = {
    probed: outcome.ok,
    interpreter: outcome.data?.interpreter ?? "",
    torch: outcome.data?.torch ?? "",
    devices: [...kinds],
    vramMb: outcome.data?.vramMb ?? 0,
    deviceName: outcome.data?.deviceName ?? "",
    reason: outcome.ok ? "" : outcome.error,
  };
  CACHE.set(key, result);
  return result;
}

export function resetRuntimeDeviceCache(): void {
  CACHE.clear();
}

/**
 * Return the profile the gate should actually select against.
 *
 * When the machine reports an accelerator the runtime cannot reach, we hand back a
 * CPU-only profile plus a note explaining why — a small variant that runs beats a large
 * one that stalls, and the user gets told how to fix it.
 */
export function reconcileHardware(
  runtimeId: RuntimeId,
  machine: HardwareProfile,
  projectRoot?: string,
): { hardware: HardwareProfile; forceCpu: boolean; runtime: RuntimeDevices } {
  if (machine.accelerator.kind === "cpu") {
    return { hardware: machine, forceCpu: false, runtime: { probed: false, interpreter: "", torch: "", devices: ["cpu"], vramMb: 0, deviceName: "", reason: "" } };
  }

  const runtime = probeRuntimeDevices(runtimeId, projectRoot);
  if (!runtime.probed) {
    // torch is missing; the worker will report unavailable with a better message than we can.
    return { hardware: machine, forceCpu: false, runtime };
  }
  if (runtime.devices.includes(machine.accelerator.kind)) {
    return { hardware: machine, forceCpu: false, runtime };
  }

  const note = `${machine.accelerator.name} is present but torch ${runtime.torch} in ${runtime.interpreter} cannot use ${machine.accelerator.kind}; selecting CPU-viable variants instead. Install a ${machine.accelerator.kind}-enabled torch build to unlock the GPU path.`;
  return {
    hardware: {
      ...machine,
      accelerator: { kind: "cpu", name: "CPU", vramMb: 0, detected: true },
      notes: [...machine.notes, note],
    },
    forceCpu: true,
    runtime,
  };
}
