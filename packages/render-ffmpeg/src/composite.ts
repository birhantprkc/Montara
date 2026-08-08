// @montara/render-ffmpeg — the professional compositor.
// renderScenePlan stacks solid scenes end-to-end; THIS path composites layered tracks into one
// frame: real media clips with position/scale (PiP), exact boxes (collage), source crop, alpha
// masks (rect / ellipse / rounded with feather), per-clip effects, opacity, and burned text.
// It is one ffmpeg invocation: a base canvas + N overlay layers (z-ordered) + drawtext + audio.

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  isMediaClip,
  normalizeHex,
  validateTimeline,
  type Clip,
  type Easing,
  type Effect,
  type Keyframe,
  type Mask,
  type Matte,
  type TextClip,
  type TextReveal,
  type Timeline,
} from "../../core/src/index";
import { mediaBin } from "./ffmpegPath";
import { drawtextFont } from "./font";

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || "").slice(-1200);
    throw new Error(`${bin} failed (exit ${r.status}): ${tail}`);
  }
}

// ---------------------------------------------------------------------------
// Keyframes
//
// The IR has always carried `keyframes`, and the slideshow-risk check counts them
// as motion — but nothing compiled them, so a "moving" timeline rendered as a still.
// ffmpeg's expression evaluator knows `t`, so a keyframe track becomes a piecewise
// expression that overlay/drawtext evaluate per frame. Properties whose filters cannot
// take an expression (scale, rotate) are still static; see ANIMATABLE below.

/**
 * Properties this engine can actually animate. Anything else stays at its static value.
 *
 * `zoom`/`panX`/`panY` are a camera inside the clip box, compiled through `zoompan`. They are
 * what turns a still plate into a drone push; plain `scale` still cannot animate, because the
 * `scale` filter resolves its dimensions once at graph-build time.
 */
export const ANIMATABLE = ["x", "y", "opacity", "zoom", "panX", "panY"] as const;

/** Commas and colons are filtergraph separators; expressions must escape them. */
function escapeExpr(expr: string): string {
  return expr.replace(/,/g, "\\,");
}

/** Normalised progress 0..1 shaped by the easing of the segment we are entering. */
function easedProgress(p: string, easing: Easing | undefined): string {
  switch (easing) {
    case "ease-in": return `(${p})*(${p})`;
    case "ease-out": return `(1-(1-(${p}))*(1-(${p})))`;
    case "ease-in-out": return `(${p})*(${p})*(3-2*(${p}))`;
    default: return `(${p})`;
  }
}

/**
 * Compile a keyframe track into an ffmpeg expression over `t`.
 *
 * Holds the first value before the first key and the last value after the last key,
 * which is what an editor expects from a clip whose animation starts mid-clip.
 */
export function keyframeExpr(frames: Keyframe[], fallback: number, timeVar = "t"): string {
  const keys = frames
    .filter((k) => Number.isFinite(k.atSec) && Number.isFinite(k.value))
    .sort((a, b) => a.atSec - b.atSec);
  if (!keys.length) return String(fallback);
  const first = keys[0]!;
  if (keys.length === 1) return String(first.value);

  // Build from the tail backwards so each segment nests inside the previous else-branch.
  let expr = String(keys[keys.length - 1]!.value);
  for (let i = keys.length - 2; i >= 0; i -= 1) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const span = b.atSec - a.atSec;
    if (span <= 0) continue;
    const p = easedProgress(`(${timeVar}-${a.atSec})/${span}`, b.easing ?? a.easing);
    const value = `(${a.value}+(${b.value - a.value})*${p})`;
    expr = `if(lt(${timeVar},${b.atSec}),${value},${expr})`;
  }
  return `if(lt(${timeVar},${first.atSec}),${first.value},${expr})`;
}

/** Static value, or an animated expression when the clip keyframes this property. */
function animated(
  clip: Clip,
  property: (typeof ANIMATABLE)[number],
  fallback: number,
  timeVar = "t",
): string {
  const frames = clip.keyframes?.[property];
  if (!frames?.length) return String(fallback);
  return keyframeExpr(frames, fallback, timeVar);
}

/** True when this clip animates any property the ffmpeg engine can compile. */
export function hasAnimation(clip: Clip): boolean {
  return ANIMATABLE.some((p) => (clip.keyframes?.[p]?.length ?? 0) > 1);
}

/** True when the clip carries a camera move (zoom or pan) that needs the zoompan path. */
export function hasCameraMove(clip: Clip): boolean {
  return (["zoom", "panX", "panY"] as const).some((p) => (clip.keyframes?.[p]?.length ?? 0) > 0);
}

const SIZE_CACHE = new Map<string, { w: number; h: number } | null>();

/**
 * Source pixel dimensions, cached per path.
 *
 * A camera move has to know the layer's exact output height: `zoompan` demands a concrete
 * `s=WxH` and silently falls back to 720p otherwise, which would letterbox the whole shot.
 * Returns null when probing fails so the caller can drop the move instead of rendering wrong.
 */
function probeSize(path: string): { w: number; h: number } | null {
  const cached = SIZE_CACHE.get(path);
  if (cached !== undefined) return cached;
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path,
  ], { encoding: "utf8" });
  const match = /^(\d+)x(\d+)/m.exec(r.stdout ?? "");
  const size = match ? { w: Number(match[1]), h: Number(match[2]) } : null;
  SIZE_CACHE.set(path, size);
  return size;
}

/** Largest zoom the clip reaches, used to pick a supersample that keeps the push sharp. */
function peakZoom(clip: Clip): number {
  const frames = clip.keyframes?.zoom ?? [];
  return frames.reduce((max, f) => (Number.isFinite(f.value) ? Math.max(max, f.value) : max), 1);
}

/**
 * `zoompan` chain implementing a camera move inside the clip box.
 *
 * The source is first scaled up by `supersample` so that at peak zoom the crop window is still
 * at least box-native — without this the push visibly softens exactly when the viewer is
 * looking hardest. Zoom is clamped at 1 because a crop window cannot exceed its input; asking
 * for less would letterbox rather than zoom out, so "zoom out" is authored as 1.4 -> 1.0.
 */
function cameraFilters(
  clip: Clip,
  boxW: number,
  boxH: number,
  fps: number,
  startSec: number,
): string[] {
  // zoompan counts output frames; translate that back to timeline seconds for the keyframes.
  const timeVar = `(${startSec}+on/${fps})`;
  const zoom = animated(clip, "zoom", 1, timeVar);
  const panX = animated(clip, "panX", 0.5, timeVar);
  const panY = animated(clip, "panY", 0.5, timeVar);

  const supersample = Math.min(Math.max(peakZoom(clip), 1), 4);
  const superW = Math.min(Math.round(boxW * supersample / 2) * 2, 5120);
  const superH = Math.min(Math.round(boxH * supersample / 2) * 2, 5120);

  return [
    // zoompan emits one output frame per input frame at its own `fps`, so a source running at
    // any other rate silently changes the clip's duration. Normalising first keeps 1:1.
    `fps=${fps}`,
    `scale=${superW}:${superH}:force_original_aspect_ratio=increase`,
    `crop=${superW}:${superH}`,
    // Commas inside the single-quoted expressions are literal, matching the geq masks below.
    `zoompan=z='clip(${zoom},1,20)':x='(iw-iw/zoom)*clip(${panX},0,1)':y='(ih-ih/zoom)*clip(${panY},0,1)':d=1:s=${boxW}x${boxH}:fps=${fps}`,
  ];
}

interface VisualLayer {
  clip: Clip;
  start: number;
  end: number;
  boxW: number;
  boxH: number | null; // null = auto height (preserve source aspect)
  cx: number;
  cy: number;
  z: number;
  /** Composition fps, needed to convert zoompan's frame counter back into timeline seconds. */
  fps: number;
  /** Whether this layer compiles a zoompan camera move. Requires a resolved boxH. */
  camera: boolean;
  /** ffmpeg -i argument group for this layer. */
  inputArgs: string[];
  /** ffmpeg -i argument group for this layer's external alpha matte, if any. */
  matteInputArgs?: string[];
  /** Resolved input index for the layer's video, filled in during input assembly. */
  videoIndex: number;
  /** Resolved input index for the matte, or -1 when the layer has none. */
  matteIndex: number;
}

/** ffmpeg `eq`/`boxblur`/etc. fragment for one effect. */
function effectFilter(e: Effect): string {
  switch (e.type) {
    case "blur": return `boxblur=${Math.max(1, Math.round((e.amount ?? 0.3) * 20))}`;
    case "brightness": return `eq=brightness=${e.amount ?? 0}`;
    case "contrast": return `eq=contrast=${e.amount ?? 1}`;
    case "saturation": return `eq=saturation=${e.amount ?? 1}`;
    case "grayscale": return "hue=s=0";
    case "sharpen": return `unsharp=5:5:${e.amount ?? 1}`;
    case "chromakey": return `chromakey=0x${normalizeHex(e.color ?? "00ff00")}:${e.similarity ?? 0.15}:0.1`;
    default: return "null";
  }
}

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|tiff?)$/i;

/** ffmpeg input args for an external matte, trimmed to line up with the clip it belongs to. */
function matteInputArgs(matte: Matte, durationSec: number, fps: number, sourceInSec?: number): string[] {
  if (IMAGE_EXT.test(matte.path)) {
    return ["-loop", "1", "-framerate", String(fps), "-t", durationSec.toFixed(3), "-i", matte.path];
  }
  return ["-ss", String(sourceInSec ?? 0), "-t", durationSec.toFixed(3), "-i", matte.path];
}

/** Even-odd crossing test for a polygon in the box's normalized space, as an ffmpeg expr. */
function polygonInsideExpr(points: { x: number; y: number }[], lx: string, ly: string): string {
  const crossings = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    // Guard the horizontal-edge divide-by-zero; such edges never contribute a crossing.
    const dy = q.y - p.y;
    if (Math.abs(dy) < 1e-9) return null;
    const straddles = `not(eq(gt(${p.y.toFixed(6)},${ly}),gt(${q.y.toFixed(6)},${ly})))`;
    const xAt = `(${p.x.toFixed(6)}+(${ly}-${p.y.toFixed(6)})*${((q.x - p.x) / dy).toFixed(6)})`;
    return `(${straddles})*lt(${lx},${xAt})`;
  }).filter((term): term is string => term !== null);

  if (!crossings.length) return "0";
  return `mod(${crossings.join("+")},2)`;
}

/**
 * geq alpha expression for a mask within the clip box.
 *
 * Multiplies the incoming alpha rather than replacing it, so a shape mask composes with
 * an external matte (background removal) on the same clip instead of overwriting it.
 */
function maskAlphaExpr(mask: Mask, opacity: number): string {
  const mx = mask.x ?? 0, my = mask.y ?? 0, mw = mask.w ?? 1, mh = mask.h ?? 1;
  const F = Math.max(mask.feather ?? 0, 0.004);
  // local coords inside the mask rect, 0..1
  const lx = `((X/W-${mx})/${mw})`;
  const ly = `((Y/H-${my})/${mh})`;
  let a: string;
  if (mask.shape === "ellipse") {
    const d = `hypot((${lx}-0.5)*2,(${ly}-0.5)*2)`;
    a = `clip((1-${d})/${F},0,1)`;
  } else if (mask.shape === "polygon") {
    // Hard edge here; feather is applied afterwards as an alpha blur (see featherChain).
    a = polygonInsideExpr(mask.points ?? [], lx, ly);
  } else {
    // rect / rounded-rect: distance to nearest edge inside the rect
    const inside = `gte(${lx},0)*lte(${lx},1)*gte(${ly},0)*lte(${ly},1)`;
    const edge = `min(min(${lx},1-${lx}),min(${ly},1-${ly}))`;
    a = `(${inside})*clip(${edge}/${F},0,1)`;
  }
  if (mask.invert) a = `(1-${a})`;
  return `alpha(X,Y)*${opacity}*${a}`;
}

/** Source-geometry filters shared by a layer and its matte so the two stay aligned. */
function geometryFilters(layer: VisualLayer): string[] {
  const parts: string[] = [];
  const crop = layer.clip.crop;
  if (crop) parts.push(`crop=w=iw*${crop.w}:h=ih*${crop.h}:x=iw*${crop.x}:y=ih*${crop.y}`);
  // A camera move subsumes the plain box fit: zoompan does its own scale/crop and emits the
  // box size directly. Running both would fit the source twice and lose resolution.
  if (layer.camera && layer.boxH != null) {
    parts.push(...cameraFilters(layer.clip, layer.boxW, layer.boxH, layer.fps, layer.start));
  } else if (layer.boxH != null) {
    parts.push(`scale=${layer.boxW}:${layer.boxH}:force_original_aspect_ratio=increase`, `crop=${layer.boxW}:${layer.boxH}`);
  } else {
    parts.push(`scale=${layer.boxW}:-2`);
  }
  return parts;
}

/** Grayscale conditioning of an external matte: invert, choke, feather, partial hold-out. */
function matteFilters(matte: Matte): string[] {
  const parts: string[] = ["format=gray"];
  if (matte.invert) parts.push("negate");
  // erosion/dilation move the edge one pixel per pass; cap the stack so the graph stays sane.
  const choke = Math.max(-8, Math.min(8, Math.round(matte.chokePx ?? 0)));
  for (let i = 0; i < Math.abs(choke); i += 1) parts.push(choke > 0 ? "dilation" : "erosion");
  if (matte.featherPx && matte.featherPx > 0) parts.push(`gblur=sigma=${(matte.featherPx / 2).toFixed(2)}`);
  if (matte.opacity != null && matte.opacity < 1) parts.push(`lutyuv=y=val*${matte.opacity}`);
  return parts;
}

/**
 * Build the filter chains producing `[L${idx}]` for one layer.
 *
 * Returns several chain strings because an external matte needs its own input branch
 * merged in with alphamerge before the shape mask and opacity are applied.
 */
function layerChain(layer: VisualLayer, idx: number): string[] {
  const clip = layer.clip;
  const tf = clip.transform ?? {};
  const opacity = tf.opacity ?? 1;
  const chains: string[] = [];

  const parts = geometryFilters(layer);
  parts.push("format=rgba");

  let label = `[L${idx}]`;
  if (layer.matteIndex >= 0 && clip.matte) {
    // Matte comes from the clip's own source, so identical geometry gives identical size.
    const matteParts = [...geometryFilters(layer), ...matteFilters(clip.matte)];
    chains.push(`[${layer.videoIndex}:v]${parts.join(",")}[L${idx}rgb]`);
    chains.push(`[${layer.matteIndex}:v]${matteParts.join(",")}[L${idx}m]`);
    chains.push(`[L${idx}rgb][L${idx}m]alphamerge[L${idx}a]`);
    label = `[L${idx}a]`;
  } else {
    chains.push(`[${layer.videoIndex}:v]${parts.join(",")}[L${idx}a]`);
    label = `[L${idx}a]`;
  }

  // Post-alpha stage: effects, rotation, shape mask, opacity.
  const post: string[] = [];
  for (const e of clip.effects ?? []) post.push(effectFilter(e));
  if (tf.rotateDeg) {
    const rad = (tf.rotateDeg * Math.PI) / 180;
    post.push(`rotate=${rad.toFixed(5)}:c=none:ow=rotw(${rad.toFixed(5)}):oh=roth(${rad.toFixed(5)})`);
  }
  post.push("format=rgba");
  if (clip.mask) {
    post.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${maskAlphaExpr(clip.mask, opacity)}'`);
  } else if (opacity < 1) {
    post.push(`colorchannelmixer=aa=${opacity}`);
  }

  const out = layer.start > 0 ? `[L${idx}p]` : `[L${idx}]`;
  const needsFeather = clip.mask?.shape === "polygon" && (clip.mask.feather ?? 0) > 0;
  if (needsFeather) {
    const sigma = ((clip.mask?.feather ?? 0) * Math.max(layer.boxW, layer.boxH ?? layer.boxW) * 0.5).toFixed(2);
    chains.push(`${label}${post.join(",")}[L${idx}f]`);
    chains.push(`[L${idx}f]split[L${idx}fa][L${idx}fb]`);
    chains.push(`[L${idx}fa]alphaextract,gblur=sigma=${sigma}[L${idx}fm]`);
    chains.push(`[L${idx}fb][L${idx}fm]alphamerge${out}`);
  } else {
    chains.push(`${label}${post.join(",")}${out}`);
  }

  // Shift the layer to its own start on the timeline.
  //
  // The input is trimmed to the clip's duration, so its frames run 0..duration while `overlay`
  // enables it over start..end on the canvas clock. Without this pad the two clocks disagree and a
  // clip that starts late shows nothing at all — every montage after the first shot renders as
  // background. Transparent padding, so the layers below still read through.
  if (layer.start > 0) {
    chains.push(`${out}tpad=start_duration=${layer.start.toFixed(3)}:start_mode=add:color=black@0[L${idx}]`);
  }
  return chains;
}

function drawtextFor(clip: TextClip, compW: number, compH: number): string {
  const text = (clip.text || "").replace(/[\\:']/g, " ").replace(/%/g, "\\%").trim().slice(0, 200);
  if (!text) return "";
  const size = clip.style?.fontSize ?? Math.round(compH * 0.06);
  const color = normalizeHex(clip.style?.color ?? "ffffff");
  const cx = animated(clip, "x", clip.transform?.x ?? compW / 2);
  const cy = animated(clip, "y", clip.transform?.y ?? compH / 2);
  const shadow = clip.style?.shadow !== false ? ":shadowcolor=black@0.7:shadowx=2:shadowy=2" : "";
  // drawtext takes alpha as an expression, so text opacity can animate even though a
  // video layer's cannot.
  const opacityFrames = clip.keyframes?.opacity;
  const alpha = opacityFrames?.length
    ? `:alpha='${escapeExpr(keyframeExpr(opacityFrames, clip.transform?.opacity ?? 1))}'`
    : clip.transform?.opacity != null && clip.transform.opacity < 1
      ? `:alpha=${clip.transform.opacity}`
      : "";
  return `drawtext=${drawtextFont({ fontFamily: clip.style?.fontFamily })}:text='${text}':fontcolor=0x${color}:fontsize=${size}:x='${escapeExpr(cx)}-text_w/2':y='${escapeExpr(cy)}-text_h/2'${shadow}${alpha}:enable='between(t\\,${clip.startSec}\\,${(clip.startSec + clip.durationSec).toFixed(3)})'`;
}

/**
 * Alpha multiplier that clips glyphs against the reveal edge.
 *
 * Pairs with an animated `y`: the text travels across a fixed edge and the mask hides whatever
 * has not crossed it yet, so the letters grow out of the scene instead of sliding in whole.
 */
function revealAlphaExpr(reveal: TextReveal): string {
  const feather = Math.max(reveal.featherPx ?? 0, 0);
  const distance = (reveal.keep ?? "above") === "above"
    ? `(${reveal.edgePx}-Y)`
    : `(Y-${reveal.edgePx})`;
  const cut = feather > 0 ? `clip(${distance}/${feather},0,1)` : `gte(${distance},0)`;
  return `alpha(X,Y)*${cut}`;
}

/** Compile a layered Timeline into a single composited MP4. Honors PiP / collage / mask / effects. */
export function compositeTimeline(timeline: Timeline, outPath: string): string {
  const issues = validateTimeline(timeline);
  if (issues.length) throw new Error(`invalid timeline: ${issues.join("; ")}`);
  const ff = mediaBin("ffmpeg");
  const { width: W, height: H, fps, durationSec: DUR, background } = timeline.composition;
  mkdirSync(dirname(outPath), { recursive: true });

  // gather visual layers (video-track clips) in z order
  const layers: VisualLayer[] = [];
  const textClips: { clip: TextClip; z: number }[] = [];
  const audioFiles: { path: string; start: number; volume: number }[] = [];
  timeline.tracks.forEach((track, ti) => {
    track.clips.forEach((clip, ci) => {
      if (clip.type === "text") { textClips.push({ clip: clip as TextClip, z: clip.z ?? ti * 100 + ci }); return; }
      if (clip.type === "audio") {
        if (clip.source.kind === "file") audioFiles.push({ path: clip.source.path, start: clip.startSec, volume: clip.volume ?? 1 });
        return;
      }
      // video: solid or media
      const tf = clip.transform ?? {};
      const scale = tf.scale ?? 1;
      const boxW = clip.box ? Math.round(clip.box.wFrac * W) : Math.round(scale * W);
      let boxH = clip.box ? Math.round(clip.box.hFrac * H) : (isMediaClip(clip) ? null : Math.round(scale * H));

      // Resolve an explicit height for camera moves: zoompan needs a concrete output size.
      // If the source cannot be probed we drop the move rather than render a letterboxed shot.
      let camera = hasCameraMove(clip);
      if (camera && boxH == null && isMediaClip(clip)) {
        const size = probeSize(clip.source.path);
        if (size && size.w > 0) boxH = Math.max(2, Math.round((boxW * size.h) / size.w / 2) * 2);
        else camera = false;
      }
      if (camera && boxH == null) camera = false;

      let inputArgs: string[];
      if (isMediaClip(clip)) {
        // A looped still defaults to 25fps, which desynchronises it from any other rate in the
        // graph; pin it to the composition so every layer shares one clock.
        inputArgs = clip.source.kind === "image"
          ? ["-loop", "1", "-framerate", String(fps), "-t", clip.durationSec.toFixed(3), "-i", clip.source.path]
          : ["-ss", String(clip.sourceInSec ?? 0), "-t", clip.durationSec.toFixed(3), "-i", clip.source.path];
      } else {
        const color = normalizeHex((clip as { source: { color: string } }).source.color);
        inputArgs = ["-f", "lavfi", "-i", `color=c=0x${color}:s=${Math.max(2, boxW)}x${Math.max(2, boxH ?? Math.round(scale * H))}:d=${DUR}:r=${fps}`];
      }
      layers.push({
        clip, start: clip.startSec, end: clip.startSec + clip.durationSec,
        boxW: Math.max(2, boxW), boxH: boxH == null ? null : Math.max(2, boxH),
        cx: tf.x ?? W / 2, cy: tf.y ?? H / 2,
        z: clip.z ?? ti * 100 + ci, fps, camera, inputArgs,
        matteInputArgs: clip.matte
          ? matteInputArgs(clip.matte, clip.durationSec, fps, isMediaClip(clip) ? clip.sourceInSec : undefined)
          : undefined,
        videoIndex: -1,
        matteIndex: -1,
      });
    });
  });
  layers.sort((a, b) => a.z - b.z);

  // assemble inputs in a fixed order so ffmpeg input indices are deterministic:
  //   [0] = background canvas, then each layer (followed by its matte, if any), then audio.
  const inputs: string[] = ["-f", "lavfi", "-i", `color=c=0x${normalizeHex(background)}:s=${W}x${H}:d=${DUR}:r=${fps}`];
  let nextIndex = 1;
  for (const layer of layers) {
    layer.videoIndex = nextIndex++;
    inputs.push(...layer.inputArgs);
    if (layer.matteInputArgs) {
      layer.matteIndex = nextIndex++;
      inputs.push(...layer.matteInputArgs);
    }
  }
  // Revealed text needs to exist as pixels before it can be masked, so each one gets a
  // transparent canvas of its own to be drawn onto. Plain text stays a cheap drawtext step.
  const revealed = textClips.filter((t) => t.clip.reveal);
  const revealIndex = new Map<TextClip, number>();
  for (const t of revealed) {
    revealIndex.set(t.clip, nextIndex++);
    inputs.push("-f", "lavfi", "-i", `color=c=black@0.0:s=${W}x${H}:d=${DUR}:r=${fps}`);
  }

  const audioStartIndex = nextIndex;
  for (const a of audioFiles) inputs.push("-i", a.path);

  // filter graph. Text is interleaved with the video layers by z, not stapled on at the
  // end — that is what lets a title sit behind a matted subject.
  type Step =
    | { z: number; kind: "layer"; layer: VisualLayer; idx: number }
    | { z: number; kind: "text"; draw: string }
    | { z: number; kind: "revealText"; clip: TextClip; input: number; idx: number };
  const steps: Step[] = [
    ...layers.map((layer, idx): Step => ({ z: layer.z, kind: "layer", layer, idx })),
    ...textClips
      .filter((t) => !t.clip.reveal)
      .map((t): Step => ({ z: t.z, kind: "text", draw: drawtextFor(t.clip, W, H) }))
      .filter((s) => s.kind !== "text" || s.draw !== ""),
    ...revealed.map((t, idx): Step => ({
      z: t.z, kind: "revealText", clip: t.clip, input: revealIndex.get(t.clip)!, idx,
    })),
  ];
  steps.sort((a, b) => a.z - b.z);

  const chains: string[] = [`[0:v]format=rgba[acc0]`];
  let acc = 0;
  for (const step of steps) {
    const prev = `[acc${acc}]`;
    const next = `[acc${acc + 1}]`;
    if (step.kind === "layer") {
      const l = step.layer;
      chains.push(...layerChain(l, step.idx));
      const ox = escapeExpr(animated(l.clip, "x", Number(l.cx.toFixed(1))));
      const oy = escapeExpr(animated(l.clip, "y", Number(l.cy.toFixed(1))));
      chains.push(`${prev}[L${step.idx}]overlay=x='${ox}-w/2':y='${oy}-h/2':enable='between(t\\,${l.start}\\,${l.end.toFixed(3)})':format=auto:eof_action=pass${next}`);
    } else if (step.kind === "revealText") {
      const draw = drawtextFor(step.clip, W, H);
      const end = (step.clip.startSec + step.clip.durationSec).toFixed(3);
      if (draw) {
        // colorchannelmixer forces the canvas fully transparent: converting the lavfi colour
        // source to rgba yields opaque alpha, which would punch a black hole in the composite.
        chains.push(
          `[${step.input}:v]format=rgba,colorchannelmixer=aa=0,${draw},geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${revealAlphaExpr(step.clip.reveal!)}'[TX${step.idx}]`,
        );
        chains.push(`${prev}[TX${step.idx}]overlay=0:0:enable='between(t\\,${step.clip.startSec}\\,${end})':format=auto${next}`);
      } else {
        chains.push(`${prev}null${next}`);
      }
    } else {
      chains.push(`${prev}${step.draw}${next}`);
    }
    acc += 1;
  }
  chains.push(`[acc${acc}]format=yuv420p[vout]`);
  const vlabel = "[vout]";

  // audio: mix file clips, else silence
  let alabel: string;
  if (audioFiles.length) {
    audioFiles.forEach((a, i) => {
      const ms = Math.round(a.start * 1000);
      chains.push(`[${audioStartIndex + i}:a]adelay=${ms}|${ms},volume=${a.volume}[a${i}]`);
    });
    chains.push(`${audioFiles.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audioFiles.length}:normalize=0[aout]`);
    alabel = "[aout]";
  } else {
    inputs.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    alabel = `${audioStartIndex + audioFiles.length}:a`; // direct input stream — no brackets
  }

  run(ff, [
    "-y", ...inputs,
    "-filter_complex", chains.join(";"),
    "-map", vlabel, "-map", alabel,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-crf", "26",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    "-t", DUR.toFixed(3), "-r", String(fps),
    outPath,
  ]);
  return outPath;
}
