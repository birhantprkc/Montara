// @montara/core — the minimal scene-plan / Timeline IR.
// Phase 1.0 keeps this tiny (a scene = a titled, timed, colored block) so the render +
// verify harness has a real, compilable target. It grows toward OM's scene model in 1.1.

export interface Scene {
  id: string;
  title: string;
  durationSec: number;
  /** hex without '#', e.g. "0a0a0a". Optional → near-black default. */
  background?: string;
}

export interface ScenePlan {
  width: number;
  height: number;
  fps: number;
  scenes: Scene[];
}

/** Total runtime of a plan in seconds. Pure — the kind of op the verify harness asserts. */
export function totalDuration(plan: ScenePlan): number {
  return plan.scenes.reduce((sum, s) => sum + Math.max(0, s.durationSec), 0);
}

/** Round to ms — shared rounding so timings stay stable across ops. */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;
