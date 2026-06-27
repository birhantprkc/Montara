// @montara/quality — verify that a terminal scene's `steps` pace with narration cues.
// The tracer mimics the frame math inside the terminal scene component so video-time
// estimates are exact to 1/fps. Fails loudly if any narration cue has no matching
// command/output within `tolerance` seconds.

export type PacingStep = Record<string, unknown>;

export interface Landmark {
  video_time: number;
  kind: string;
  text: string;
}

function num(step: PacingStep, key: string, fallback: number): number {
  const v = step[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(step: PacingStep, key: string, fallback = ""): string {
  const v = step[key];
  return typeof v === "string" ? v : fallback;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Cursor advancement for a single step (frame-accurate). Pills do NOT advance
 * the cursor — they're non-blocking overlays. */
export function stepDuration(step: PacingStep, fps = 30): number {
  const k = step.kind;
  if (k === "cmd") {
    const typeFrames = Math.ceil(str(step, "text").length * num(step, "typeSpeed", 0.035) * fps);
    return typeFrames / fps + num(step, "holdSeconds", 0.3);
  }
  if (k === "out") {
    const revealFrames = Math.max(2, Math.ceil(0.08 * fps));
    return revealFrames / fps + num(step, "holdSeconds", 0.15);
  }
  if (k === "pause") {
    return num(step, "seconds", 0);
  }
  if (k === "pill") {
    return 0.0;
  }
  throw new Error(`Unknown step kind: ${JSON.stringify(k)}`);
}

function padTime(vt: number): string {
  return `${vt.toFixed(2)}s`.padStart(8);
}

/** Walk the step list and emit a video-time landmark for each visible event. */
export function trace(steps: PacingStep[], sceneStart = 0.0, fps = 30, opts: { quiet?: boolean } = {}): Landmark[] {
  const quiet = opts.quiet ?? false;
  let cursor = 0.0;
  const out: Landmark[] = [];
  for (const s of steps) {
    const k = s.kind;
    const vt = round2(cursor + sceneStart);
    if (k === "cmd" || k === "out" || k === "pill") {
      const text = str(s, "text");
      const kindUpper = String(k).toUpperCase();
      out.push({ video_time: vt, kind: kindUpper, text });
      if (!quiet) {
        const prefix = kindUpper === "PILL" ? "PILL " : `${kindUpper}  `;
        console.log(`  ${padTime(vt)}  ${prefix}${text.slice(0, 60)}`);
      }
    }
    cursor += stepDuration(s, fps);
  }
  const endVt = round2(cursor + sceneStart);
  if (!quiet) console.log(`  ${padTime(endVt)}  -- steps end --`);
  return out;
}

/** Validate that every narration cue has a visual landmark within tolerance, and
 * that total step duration neither overflows nor badly underfills the scene.
 * Throws on any mismatch. */
export function assertAlignment(
  steps: PacingStep[],
  sceneStart: number,
  sceneEnd: number,
  narrationCues: [number, string][],
  opts: { tolerance?: number; fps?: number } = {},
): void {
  const tolerance = opts.tolerance ?? 1.0;
  const fps = opts.fps ?? 30;
  const landmarks = trace(steps, sceneStart, fps, { quiet: true });
  const errors: string[] = [];

  for (const [cueTime, cueDesc] of narrationCues) {
    if (!landmarks.length) {
      errors.push(`cue ${cueTime.toFixed(2)}s (${cueDesc}): no landmarks at all`);
      continue;
    }
    let closest = landmarks[0]!;
    for (const lm of landmarks) {
      if (Math.abs(lm.video_time - cueTime) < Math.abs(closest.video_time - cueTime)) closest = lm;
    }
    const delta = closest.video_time - cueTime;
    if (Math.abs(delta) > tolerance) {
      errors.push(
        `cue ${cueTime.toFixed(2)}s (${cueDesc}) has no visual within ±${tolerance.toFixed(1)}s — ` +
        `closest is ${closest.kind} at ${closest.video_time.toFixed(2)}s (${signed(delta)}s off): ${closest.text.slice(0, 40)}`,
      );
    }
  }

  let cursor = 0;
  for (const s of steps) cursor += stepDuration(s, fps);
  const endVt = sceneStart + cursor;
  const sceneDuration = sceneEnd - sceneStart;
  if (cursor > sceneDuration + 0.5) {
    errors.push(
      `steps overflow scene: cursor ends at ${endVt.toFixed(2)}s but scene_end is ${sceneEnd.toFixed(2)}s ` +
      `(overflow ${(cursor - sceneDuration).toFixed(2)}s)`,
    );
  }
  if (cursor < sceneDuration - 5.0) {
    errors.push(
      `steps underfill scene by ${(sceneDuration - cursor).toFixed(2)}s — last visible step holds ` +
      `frozen from ${endVt.toFixed(2)}s to ${sceneEnd.toFixed(2)}s. Add a closer pause.`,
    );
  }

  if (errors.length) {
    throw new Error("Scene pacing check failed:\n  - " + errors.join("\n  - "));
  }
}

function signed(x: number): string {
  return x >= 0 ? `+${x.toFixed(2)}` : x.toFixed(2);
}
