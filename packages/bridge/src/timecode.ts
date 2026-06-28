// @montara/bridge — timecode helpers shared by the pro-editor exporters.

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Non-drop-frame SMPTE timecode HH:MM:SS:FF from an absolute frame count. */
export function framesToTimecode(totalFrames: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const f = Math.max(0, Math.round(totalFrames));
  const ff = f % rate;
  const totalSec = Math.floor(f / rate);
  return `${p2(Math.floor(totalSec / 3600))}:${p2(Math.floor(totalSec / 60) % 60)}:${p2(totalSec % 60)}:${p2(ff)}`;
}

export const secondsToTimecode = (sec: number, fps: number): string => framesToTimecode(sec * fps, fps);

/** Whole-frame count for a duration (used for OTIO RationalTime and FCPXML rationals). */
export const secondsToFrameCount = (sec: number, fps: number): number => Math.max(0, Math.round(sec * fps));
