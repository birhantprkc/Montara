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
  type Effect,
  type Mask,
  type TextClip,
  type Timeline,
} from "../../core/src/index";
import { mediaBin } from "./ffmpegPath";

const FONT = "C\\:/Windows/Fonts/arialbd.ttf";

function run(bin: string, args: string[]): void {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    const tail = (r.stderr || r.error?.message || "").slice(-1200);
    throw new Error(`${bin} failed (exit ${r.status}): ${tail}`);
  }
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
  /** ffmpeg -i argument group for this layer. */
  inputArgs: string[];
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

/** geq alpha expression (0..255) for a mask within the clip box, folded with opacity. */
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
  } else {
    // rect / rounded-rect: distance to nearest edge inside the rect
    const inside = `gte(${lx},0)*lte(${lx},1)*gte(${ly},0)*lte(${ly},1)`;
    const edge = `min(min(${lx},1-${lx}),min(${ly},1-${ly}))`;
    a = `(${inside})*clip(${edge}/${F},0,1)`;
  }
  if (mask.invert) a = `(1-${a})`;
  return `255*${opacity}*${a}`;
}

/** Build the per-layer filter chain producing `[L${idx}]` from input `[${inIdx}:v]`. */
function layerChain(layer: VisualLayer, inIdx: number, idx: number): string {
  const clip = layer.clip;
  const parts: string[] = [];
  const tf = clip.transform ?? {};
  const opacity = tf.opacity ?? 1;

  if (clip.crop) {
    const { x, y, w, h } = clip.crop;
    parts.push(`crop=w=iw*${w}:h=ih*${h}:x=iw*${x}:y=ih*${y}`);
  }
  if (layer.boxH != null) {
    parts.push(`scale=${layer.boxW}:${layer.boxH}:force_original_aspect_ratio=increase`, `crop=${layer.boxW}:${layer.boxH}`);
  } else {
    parts.push(`scale=${layer.boxW}:-2`);
  }
  for (const e of clip.effects ?? []) parts.push(effectFilter(e));
  if (tf.rotateDeg) {
    const rad = (tf.rotateDeg * Math.PI) / 180;
    parts.push(`rotate=${rad.toFixed(5)}:c=none:ow=rotw(${rad.toFixed(5)}):oh=roth(${rad.toFixed(5)})`);
  }
  parts.push("format=rgba");
  if (clip.mask) {
    const a = maskAlphaExpr(clip.mask, opacity);
    parts.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${a}'`);
  } else if (opacity < 1) {
    parts.push(`colorchannelmixer=aa=${opacity}`);
  }
  return `[${inIdx}:v]${parts.join(",")}[L${idx}]`;
}

function drawtextFor(clip: TextClip, compW: number, compH: number): string {
  const text = (clip.text || "").replace(/[\\:']/g, " ").replace(/%/g, "\\%").trim().slice(0, 200);
  if (!text) return "";
  const size = clip.style?.fontSize ?? Math.round(compH * 0.06);
  const color = normalizeHex(clip.style?.color ?? "ffffff");
  const cx = clip.transform?.x ?? compW / 2;
  const cy = clip.transform?.y ?? compH / 2;
  const shadow = clip.style?.shadow !== false ? ":shadowcolor=black@0.7:shadowx=2:shadowy=2" : "";
  return `drawtext=fontfile='${FONT}':text='${text}':fontcolor=0x${color}:fontsize=${size}:x=${cx}-text_w/2:y=${cy}-text_h/2${shadow}:enable='between(t\\,${clip.startSec}\\,${(clip.startSec + clip.durationSec).toFixed(3)})'`;
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
  const textClips: TextClip[] = [];
  const audioFiles: { path: string; start: number; volume: number }[] = [];
  timeline.tracks.forEach((track, ti) => {
    track.clips.forEach((clip, ci) => {
      if (clip.type === "text") { textClips.push(clip as TextClip); return; }
      if (clip.type === "audio") {
        if (clip.source.kind === "file") audioFiles.push({ path: clip.source.path, start: clip.startSec, volume: clip.volume ?? 1 });
        return;
      }
      // video: solid or media
      const tf = clip.transform ?? {};
      const scale = tf.scale ?? 1;
      const boxW = clip.box ? Math.round(clip.box.wFrac * W) : Math.round(scale * W);
      const boxH = clip.box ? Math.round(clip.box.hFrac * H) : (isMediaClip(clip) ? null : Math.round(scale * H));
      let inputArgs: string[];
      if (isMediaClip(clip)) {
        inputArgs = clip.source.kind === "image"
          ? ["-loop", "1", "-t", clip.durationSec.toFixed(3), "-i", clip.source.path]
          : ["-ss", String(clip.sourceInSec ?? 0), "-t", clip.durationSec.toFixed(3), "-i", clip.source.path];
      } else {
        const color = normalizeHex((clip as { source: { color: string } }).source.color);
        inputArgs = ["-f", "lavfi", "-i", `color=c=0x${color}:s=${Math.max(2, boxW)}x${Math.max(2, boxH ?? Math.round(scale * H))}:d=${DUR}:r=${fps}`];
      }
      layers.push({
        clip, start: clip.startSec, end: clip.startSec + clip.durationSec,
        boxW: Math.max(2, boxW), boxH: boxH == null ? null : Math.max(2, boxH),
        cx: tf.x ?? W / 2, cy: tf.y ?? H / 2,
        z: clip.z ?? ti * 100 + ci, inputArgs,
      });
    });
  });
  layers.sort((a, b) => a.z - b.z);

  // assemble inputs in a fixed order so ffmpeg input indices are deterministic:
  //   [0] = background canvas, [1..N] = one input per visual layer, [N+1..] = audio files.
  const inputs: string[] = ["-f", "lavfi", "-i", `color=c=0x${normalizeHex(background)}:s=${W}x${H}:d=${DUR}:r=${fps}`];
  const inputIndexOf: number[] = [];
  layers.forEach((l, k) => { inputIndexOf[k] = k + 1; inputs.push(...l.inputArgs); });
  const audioStartIndex = layers.length + 1;
  for (const a of audioFiles) inputs.push("-i", a.path);

  // filter graph
  const chains: string[] = [`[0:v]format=rgba[acc0]`];
  layers.forEach((l, k) => {
    chains.push(layerChain(l, inputIndexOf[k]!, k));
    const prev = `[acc${k}]`;
    const next = `[acc${k + 1}]`;
    chains.push(`${prev}[L${k}]overlay=x='${l.cx.toFixed(1)}-w/2':y='${l.cy.toFixed(1)}-h/2':enable='between(t\\,${l.start}\\,${l.end.toFixed(3)})':format=auto:eof_action=pass${next}`);
  });
  let vlabel = `[acc${layers.length}]`;
  const draws = textClips.map((t) => drawtextFor(t, W, H)).filter(Boolean);
  if (draws.length) {
    chains.push(`${vlabel}${draws.join(",")},format=yuv420p[vout]`);
  } else {
    chains.push(`${vlabel}format=yuv420p[vout]`);
  }
  vlabel = "[vout]";

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
