// Where is the subject actually standing?
//
// Placing a matted person by hand means two magic numbers per shot (how big, how far down) and they
// have to be re-tuned for every delivery frame. Worse, a contact shadow parked at a fixed offset
// drifts off his feet the moment he walks away from camera — which is exactly the tell that makes a
// composite look pasted.
//
// The matte already knows. Its alpha bounding box *is* the subject's silhouette, so reading the box
// over time gives the foot line and the horizontal centre for free, in source-normalised
// coordinates that survive any box size or aspect ratio.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./assets.mjs";

/** Alpha bounding box of a matte frame, normalised 0..1 against the source frame. */
function bboxAt(mattePath, atSec) {
  // cropdetect reports the tightest rect that still contains everything above `limit`. On a luma
  // matte that is precisely the silhouette. reset=1 stops it accumulating across the probe frames.
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-ss", String(atSec), "-i", mattePath,
     "-vf", "cropdetect=limit=24:round=2:reset=1", "-frames:v", "3", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const text = r.stderr ?? "";
  const matches = [...text.matchAll(/crop=(\d+):(\d+):(-?\d+):(-?\d+)/g)];
  const last = matches[matches.length - 1];
  const dims = /Video:.*?, (\d+)x(\d+)/.exec(text);
  if (!last || !dims) return null;
  const [W, H] = [Number(dims[1]), Number(dims[2])];
  const [w, h, x, y] = [Number(last[1]), Number(last[2]), Number(last[3]), Number(last[4])];
  if (!(W > 0 && H > 0 && w > 0 && h > 0)) return null;
  return {
    left: x / W,
    top: y / H,
    right: (x + w) / W,
    bottom: (y + h) / H,
    centerX: (x + w / 2) / W,
    width: w / W,
    height: h / H,
  };
}

/**
 * Sample the subject's silhouette across a clip.
 *
 * Cached: cropdetect costs a decode seek per sample and the numbers never change for a given matte.
 */
export function groundTrack(mattePath, { from = 0, to, samples = 7 } = {}) {
  const key = createHash("sha1").update(mattePath).update(`${from}|${to}|${samples}`).digest("hex").slice(0, 10);
  const cachePath = join(CACHE, `ground-${key}.json`);
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, "utf8"));

  const track = [];
  for (let i = 0; i < samples; i += 1) {
    const atSec = from + ((to - from) * i) / Math.max(samples - 1, 1);
    const box = bboxAt(mattePath, atSec);
    if (box) track.push({ atSec, ...box });
  }
  if (!track.length) throw new Error(`could not read a silhouette from ${mattePath}`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(track, null, 2));
  return track;
}

/**
 * Solve the subject's placement and a contact shadow that stays welded to his feet.
 *
 * Give it the frame, the box scale, and where on the canvas his feet should touch down at the top
 * of the shot. It returns the clip centre that puts them there, plus keyframes tracking the feet
 * and a shadow that shrinks and fades as he walks away — because a shadow that keeps its size while
 * its owner recedes reads as a sticker on the road.
 */
export function stage(track, { w, h, scale, feetAtY, shadowWidthFactor = 1.35 }) {
  const boxW = scale * w;
  const boxH = scale * h;
  const first = track[0];

  // Place the box so the silhouette's foot line lands on feetAtY at t=0.
  const cy = feetAtY - first.bottom * boxH + boxH / 2;
  const cx = w / 2 - (first.centerX - 0.5) * boxW;

  const toCanvas = (s) => ({
    atSec: s.atSec,
    feetY: cy - boxH / 2 + s.bottom * boxH,
    centerX: cx - boxW / 2 + s.centerX * boxW,
    // Silhouette height is the honest proxy for distance: half as tall means twice as far.
    scale: s.height / first.height,
  });
  const canvas = track.map(toCanvas);

  return {
    x: Math.round(cx),
    y: Math.round(cy),
    boxW,
    boxH,
    /** Keyframed ellipse welded to the feet, shrinking and softening with distance. */
    shadow: {
      wFrac: (first.width * boxW * shadowWidthFactor) / w,
      hFrac: (first.width * boxW * shadowWidthFactor * 0.28) / h,
      y: canvas[0].feetY,
      keyframes: {
        y: canvas.map((c, i) => ({ atSec: c.atSec, value: Math.round(c.feetY), easing: i ? "linear" : undefined })),
        x: canvas.map((c) => ({ atSec: c.atSec, value: Math.round(c.centerX) })),
        opacity: canvas.map((c) => ({ atSec: c.atSec, value: Math.max(0.06, 0.34 * c.scale ** 1.6) })),
      },
    },
    track: canvas,
  };
}
