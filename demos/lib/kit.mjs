// Timeline building blocks shared by the demo reel.
//
// These are plain functions returning IR fragments, not a component system: a demo should read as
// "here is the shot list", and anything clever hidden in here makes the shot list harder to read.
import { fitFontSize } from "../../packages/render-ffmpeg/src/measure.ts";

export const FPS = 30;

/**
 * Point size for a title that must sit inside `frameW` with a margin.
 *
 * Authoring one size as a fraction of width is what puts a 13-character title off both edges of a
 * 9:16 cut: the fraction that flatters "DEPTH" overflows "SAN FRANCISCO". This measures the string.
 */
export function titleSize(text, frameW, { idealFrac = 0.1, insetFrac = 0.06 } = {}) {
  return fitFontSize(text, frameW * (1 - insetFrac * 2), { max: Math.round(frameW * idealFrac) });
}

/** A full-frame plate with a camera move inside it — the drone push that stops stills reading as stills. */
export function plate(path, { start = 0, dur, z = 0, inSec = 0, zoom = [1.0, 1.12], panX = [0.5, 0.5], panY = [0.5, 0.5], w = 1920, h = 1080, effects = [], kind = "video" } = {}) {
  return {
    id: `plate-${Math.random().toString(36).slice(2, 8)}`,
    // Clip type is the *track* it lives on; a still is a video clip whose source happens to be an
    // image. `source.kind` is what tells the compositor to loop a frame instead of decoding a file.
    type: "video",
    startSec: start,
    durationSec: dur,
    z,
    source: { kind, path },
    ...(kind === "video" ? { sourceInSec: inSec } : {}),
    box: { wFrac: 1, hFrac: 1 },
    transform: { x: w / 2, y: h / 2 },
    keyframes: {
      zoom: [
        { atSec: start, value: zoom[0], easing: "ease-in-out" },
        { atSec: start + dur, value: zoom[1], easing: "ease-in-out" },
      ],
      panX: [
        { atSec: start, value: panX[0], easing: "ease-in-out" },
        { atSec: start + dur, value: panX[1], easing: "ease-in-out" },
      ],
      panY: [
        { atSec: start, value: panY[0], easing: "ease-in-out" },
        { atSec: start + dur, value: panY[1], easing: "ease-in-out" },
      ],
    },
    effects,
  };
}

/**
 * A title that climbs out of an edge.
 *
 * `edgePx` is the surface it emerges from — a road, a horizon, the bottom of a card. Pair it with a
 * `z` below the subject and the letters both rise out of the ground *and* pass behind him, which is
 * the shot people screenshot.
 */
export function reveal(text, { start, dur, edgePx, restY, riseFrom = 130, z = 12, size = 170, color = "ffffff", x = 960, feather = 3, hold = 1.8 } = {}) {
  return {
    id: `title-${text.slice(0, 8).replace(/\W/g, "")}`,
    type: "text",
    startSec: start,
    durationSec: dur,
    z,
    text,
    style: { fontSize: size, color, shadow: false },
    transform: { x, y: restY },
    reveal: { edgePx, keep: "above", featherPx: feather },
    keyframes: {
      y: [
        { atSec: start + 0.15, value: restY + riseFrom, easing: "ease-out" },
        { atSec: start + hold, value: restY, easing: "ease-out" },
      ],
    },
  };
}

/** Plain animated caption — fades up, holds, fades out. For labels, not for hero titles. */
export function caption(text, { start, dur, y, x = 960, size = 46, color = "ffffff", z = 60, fade = 0.35 } = {}) {
  return {
    id: `cap-${Math.random().toString(36).slice(2, 8)}`,
    type: "text",
    startSec: start,
    durationSec: dur,
    z,
    text,
    style: { fontSize: size, color, shadow: true },
    transform: { x, y },
    keyframes: {
      opacity: [
        { atSec: start, value: 0 },
        { atSec: start + fade, value: 1, easing: "ease-out" },
        { atSec: start + dur - fade, value: 1 },
        { atSec: start + dur, value: 0, easing: "ease-in" },
      ],
    },
  };
}

/**
 * The soft ellipse under a composited subject.
 *
 * Without it a matted person floats: the eye reads "no contact shadow" as "pasted on" long before
 * it consciously notices the cutout. Feed it a `stage()` result and it stays welded to the feet
 * that the matte actually reports, rather than to an offset someone guessed once.
 */
export function contactShadow({ start = 0, dur, shadow, z = 10 }) {
  return {
    id: "contact",
    type: "video",
    startSec: start,
    durationSec: dur,
    z,
    source: { kind: "solid", color: "000000" },
    box: { wFrac: shadow.wFrac, hFrac: shadow.hFrac },
    transform: { x: shadow.keyframes.x[0].value, y: shadow.y, opacity: shadow.keyframes.opacity[0].value },
    mask: { shape: "ellipse", feather: 0.6 },
    keyframes: shadow.keyframes,
  };
}

/** A matted subject, colour-nudged toward the plate it is standing in. */
export function subject(path, mattePath, { start = 0, dur, inSec = 0, scale = 0.62, x, y, z = 20, saturation = 0.9, contrast = 0.96 }) {
  return {
    id: "subject",
    type: "video",
    startSec: start,
    durationSec: dur,
    z,
    source: { kind: "video", path },
    sourceInSec: inSec,
    box: { wFrac: scale, hFrac: scale },
    transform: { x, y },
    matte: { path: mattePath, kind: "luma", chokePx: 1, featherPx: 2 },
    effects: [
      { type: "saturation", amount: saturation },
      { type: "contrast", amount: contrast },
    ],
  };
}

/** A solid colour card, for wipes and letterbox bars. */
export function solid(color, { start, dur, z, x, y, wFrac = 1, hFrac = 1, opacity = 1, keyframes } = {}) {
  return {
    id: `solid-${Math.random().toString(36).slice(2, 8)}`,
    type: "video",
    startSec: start,
    durationSec: dur,
    z,
    source: { kind: "solid", color },
    box: { wFrac, hFrac },
    transform: { x, y, opacity },
    ...(keyframes ? { keyframes } : {}),
  };
}

export function timeline(clips, { dur, w = 1920, h = 1080, fps = FPS, background = "000000", name = "montara demo" }) {
  const video = clips.filter((c) => c.type !== "text");
  const text = clips.filter((c) => c.type === "text");
  return {
    version: "1.1",
    composition: { width: w, height: h, fps, durationSec: dur, background },
    tracks: [
      { id: "v1", type: "video", clips: video },
      ...(text.length ? [{ id: "t1", type: "text", clips: text }] : []),
    ],
    metadata: { producedBy: name },
  };
}
