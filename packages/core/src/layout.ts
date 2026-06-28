// @montara/core — high-level composition builders on the Timeline IR.
// PiP, collage, and overlays are not special render modes — they are just media clips with a
// transform (position + scale), an optional crop, and an optional mask, stacked on video tracks.
// These constructors emit ready-to-render Timelines so a GUI / agent / CLI can ask for
// "picture-in-picture" or "2x2 collage" without hand-writing the IR.

import { normalizeHex, round3, type Composition, type MediaClip, type Mask, type Timeline, type Track } from "./types";

export interface MediaSpec {
  path: string;
  kind?: "image" | "video";
}

export type Corner = "tl" | "tr" | "bl" | "br";

function guessKind(spec: MediaSpec): "image" | "video" {
  if (spec.kind) return spec.kind;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(spec.path) ? "image" : "video";
}

function comp(width: number, height: number, fps: number, durationSec: number, background: string): Composition {
  return { width: Math.round(width), height: Math.round(height), fps: Math.round(fps), durationSec: round3(durationSec), background: normalizeHex(background) };
}

/** A single full-duration media clip with a centered box of `scale` (fraction of comp width). */
export function mediaClip(
  id: string,
  spec: MediaSpec,
  c: Composition,
  opts: { scale?: number; x?: number; y?: number; durationSec?: number; startSec?: number; fit?: MediaClip["fit"]; mask?: Mask } = {},
): MediaClip {
  return {
    id,
    type: "video",
    startSec: round3(opts.startSec ?? 0),
    durationSec: round3(opts.durationSec ?? c.durationSec),
    source: { kind: guessKind(spec), path: spec.path },
    fit: opts.fit ?? "cover",
    transform: {
      x: opts.x ?? c.width / 2,
      y: opts.y ?? c.height / 2,
      scale: opts.scale ?? 1,
      opacity: 1,
    },
    ...(opts.mask ? { mask: opts.mask } : {}),
  };
}

export interface PipOptions {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  base: MediaSpec;
  inset: MediaSpec;
  corner?: Corner;
  /** Inset box width as a fraction of composition width. */
  insetScale?: number;
  /** Margin from the edge as a fraction of composition width. */
  marginPct?: number;
  /** Optional mask on the inset (e.g. {shape:"ellipse"} for a circular PiP). */
  insetMask?: Mask;
  background?: string;
}

/** Picture-in-picture: a base layer filling the frame with an inset clip parked in a corner. */
export function pictureInPicture(opts: PipOptions): Timeline {
  const c = comp(opts.width, opts.height, opts.fps, opts.durationSec, opts.background ?? "000000");
  const corner: Corner = opts.corner ?? "br";
  const insetScale = opts.insetScale ?? 0.3;
  const margin = (opts.marginPct ?? 0.04) * c.width;
  const bw = insetScale * c.width;
  const bh = insetScale * c.height;
  const left = margin + bw / 2;
  const right = c.width - margin - bw / 2;
  const top = margin + bh / 2;
  const bottom = c.height - margin - bh / 2;
  const pos: Record<Corner, { x: number; y: number }> = {
    tl: { x: left, y: top },
    tr: { x: right, y: top },
    bl: { x: left, y: bottom },
    br: { x: right, y: bottom },
  };

  const base = mediaClip("pip-base", opts.base, c, { scale: 1 });
  const inset = mediaClip("pip-inset", opts.inset, c, {
    scale: insetScale,
    x: pos[corner].x,
    y: pos[corner].y,
    fit: "cover",
    ...(opts.insetMask ? { mask: opts.insetMask } : {}),
  });
  inset.z = 10;

  return {
    version: "1.1",
    composition: c,
    tracks: [{ id: "video-base", type: "video", clips: [base] }, { id: "video-pip", type: "video", clips: [inset] }],
    metadata: { source: "layout.pip", corner },
  };
}

export interface CollageOptions {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  cells: MediaSpec[];
  cols?: number;
  rows?: number;
  /** Gap between tiles as a fraction of composition width. */
  gapPct?: number;
  background?: string;
}

/** Grid collage: each cell is a cover-fit media clip placed in its grid slot. */
export function collage(opts: CollageOptions): Timeline {
  const c = comp(opts.width, opts.height, opts.fps, opts.durationSec, opts.background ?? "0a0a0a");
  const n = opts.cells.length;
  const cols = opts.cols ?? Math.ceil(Math.sqrt(n));
  const rows = opts.rows ?? Math.ceil(n / cols);
  const gap = (opts.gapPct ?? 0.01) * c.width;
  const cellW = (c.width - gap * (cols + 1)) / cols;
  const cellH = (c.height - gap * (rows + 1)) / rows;
  const track: Track = { id: "video-collage", type: "video", clips: [] };

  opts.cells.forEach((spec, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (row >= rows) return;
    const cx = gap + col * (cellW + gap) + cellW / 2;
    const cy = gap + row * (cellH + gap) + cellH / 2;
    const clip = mediaClip(`tile-${i}`, spec, c, { scale: cellW / c.width, x: cx, y: cy, fit: "cover" });
    // tiles fill an exact cell box (cover-cropped), independent of source aspect
    clip.box = { wFrac: cellW / c.width, hFrac: cellH / c.height };
    track.clips.push(clip);
  });

  return { version: "1.1", composition: c, tracks: [track], metadata: { source: "layout.collage", cols, rows } };
}
