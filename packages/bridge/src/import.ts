// @montara/bridge — pro-editor IMPORT (the inverse of the exporters). Read a cut that came back from
// Premiere / DaVinci / Final Cut (CMX3600 EDL, OpenTimelineIO, or FCPXML) and rebuild the Montara
// Timeline IR from it, so the IR stays the single source of truth on the round trip BACK in.
//
// This is intentionally lossy-but-faithful, matching the exporters: media references become
// MediaClips on a video track; titles / generated / missing references become TextClips on a text
// track; audio references become AudioClips. Per-clip effects/keyframes are not carried by these
// interchange formats and are therefore not reconstructed.

import type { AudioClip, Clip, MediaClip, TextClip, Timeline, Track } from "../../core/src/index";
import { round3 } from "../../core/src/index";
import type { EditorFormat } from "./index";

export interface ImportOptions {
  /** Composition width when the format does not carry it (EDL/OTIO). Default 1920. */
  width?: number;
  /** Composition height when the format does not carry it (EDL/OTIO). Default 1080. */
  height?: number;
  /** FPS when the format does not carry it (EDL). Default 30. */
  fps?: number;
  /** Composition background hex (no '#'). Default "0a0a0a". */
  background?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i;

function mediaKind(path: string): "image" | "video" {
  return IMAGE_EXT.test(path) ? "image" : "video";
}

/** Parse FCPXML / OTIO rational time like "180/30s", "6s", "0s" -> seconds. */
function rationalToSeconds(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim().replace(/s$/, "");
  if (s.includes("/")) {
    const parts = s.split("/").map(Number);
    const num = parts[0] ?? NaN;
    const den = parts[1] ?? NaN;
    if (Number.isFinite(num) && Number.isFinite(den) && den) return num / den;
    return 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Non-drop SMPTE "HH:MM:SS:FF" -> seconds at the given fps. */
function timecodeToSeconds(tc: string, fps: number): number {
  const parts = tc.split(":").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return 0;
  const [h, m, s, f] = parts as [number, number, number, number];
  return h * 3600 + m * 60 + s + f / Math.max(1, fps);
}

interface CollectedClips {
  video: MediaClip[];
  text: TextClip[];
  audio: AudioClip[];
}

function assembleTimeline(
  collected: CollectedClips,
  comp: { width: number; height: number; fps: number; background: string },
  metadata: Record<string, unknown>,
): Timeline {
  const tracks: Track[] = [];
  if (collected.video.length) tracks.push({ id: "video-1", type: "video", clips: collected.video as Clip[] });
  if (collected.text.length) tracks.push({ id: "text-1", type: "text", clips: collected.text as Clip[] });
  if (collected.audio.length) tracks.push({ id: "audio-1", type: "audio", clips: collected.audio as Clip[] });
  if (!tracks.length) tracks.push({ id: "video-1", type: "video", clips: [] });

  const end = [...collected.video, ...collected.text, ...collected.audio].reduce(
    (max, c) => Math.max(max, c.startSec + c.durationSec),
    0,
  );
  return {
    version: "1.1",
    composition: {
      width: Math.max(16, Math.round(comp.width)),
      height: Math.max(16, Math.round(comp.height)),
      fps: Math.max(1, Math.round(comp.fps)),
      durationSec: round3(Math.max(end, 0.001)),
      background: comp.background,
    },
    tracks,
    metadata,
  };
}

/** Import a CMX3600 EDL. Reel "AX" -> media clip; "BL" / generated -> text clip. */
export function edlToTimeline(content: string, opts: ImportOptions = {}): Timeline {
  const fps = opts.fps ?? 30;
  const lines = content.split(/\r?\n/);
  const collected: CollectedClips = { video: [], text: [], audio: [] };
  // EDL event: "001  AX       V     C        SRCIN SRCOUT RECIN RECOUT"
  const eventRe = /^(\d{3})\s+(\S+)\s+(\S+)\s+C\s+(\d\d:\d\d:\d\d:\d\d)\s+(\d\d:\d\d:\d\d:\d\d)\s+(\d\d:\d\d:\d\d:\d\d)\s+(\d\d:\d\d:\d\d:\d\d)/;
  let pending: { reel: string; srcIn: number; recIn: number; recOut: number } | null = null;
  let index = 0;
  const flush = (name: string): void => {
    if (!pending) return;
    const startSec = round3(pending.recIn);
    const durationSec = round3(Math.max(0.001, pending.recOut - pending.recIn));
    index += 1;
    if (pending.reel === "BL") {
      collected.text.push({ id: `edl-text-${index}`, type: "text", startSec, durationSec, text: name || `Event ${index}` });
    } else {
      collected.video.push({
        id: `edl-clip-${index}`,
        type: "video",
        startSec,
        durationSec,
        source: { kind: mediaKind(name), path: name },
        sourceInSec: round3(pending.srcIn),
        label: name,
      });
    }
    pending = null;
  };
  for (const line of lines) {
    const m = eventRe.exec(line);
    if (m) {
      flush(`Event ${index + 1}`); // close any event that had no clip-name comment
      pending = {
        reel: m[2]!,
        srcIn: timecodeToSeconds(m[4]!, fps),
        recIn: timecodeToSeconds(m[6]!, fps),
        recOut: timecodeToSeconds(m[7]!, fps),
      };
      continue;
    }
    const nameMatch = /^\*\s*FROM CLIP NAME:\s*(.+)$/.exec(line.trim());
    if (nameMatch && pending) flush(nameMatch[1]!.trim());
  }
  flush(`Event ${index + 1}`);
  return assembleTimeline(collected, {
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    fps,
    background: opts.background ?? "0a0a0a",
  }, { source: "edl-import", clips: collected.video.length + collected.text.length });
}

interface OtioRationalTime { value?: number; rate?: number }
interface OtioRange { start_time?: OtioRationalTime; duration?: OtioRationalTime }
interface OtioNode {
  OTIO_SCHEMA?: string;
  name?: string;
  kind?: string;
  rate?: number;
  source_range?: OtioRange;
  media_reference?: { OTIO_SCHEMA?: string; target_url?: string; name?: string };
  children?: OtioNode[];
  tracks?: OtioNode;
  global_start_time?: OtioRationalTime;
}

/** Import an OpenTimelineIO JSON document (DaVinci / Premiere via OTIO). */
export function otioToTimeline(content: string, opts: ImportOptions = {}): Timeline {
  const doc = JSON.parse(content) as OtioNode;
  const fps = Math.round(doc.global_start_time?.rate ?? doc.tracks?.children?.[0]?.children?.[0]?.source_range?.duration?.rate ?? opts.fps ?? 30);
  const sec = (t: OtioRationalTime | undefined): number => (t?.value ?? 0) / Math.max(1, t?.rate ?? fps);
  const collected: CollectedClips = { video: [], text: [], audio: [] };
  const trackNodes = doc.tracks?.children ?? [];
  let counter = 0;
  for (const track of trackNodes) {
    const isAudio = track.kind === "Audio";
    let cursor = 0;
    for (const child of track.children ?? []) {
      const dur = sec(child.source_range?.duration);
      if (child.OTIO_SCHEMA?.startsWith("Gap")) {
        cursor = round3(cursor + dur);
        continue;
      }
      if (!child.OTIO_SCHEMA?.startsWith("Clip")) continue;
      counter += 1;
      const startSec = round3(cursor);
      const durationSec = round3(Math.max(0.001, dur));
      const inSec = round3(sec(child.source_range?.start_time));
      const ref = child.media_reference;
      const url = ref?.OTIO_SCHEMA?.startsWith("ExternalReference") ? ref.target_url : undefined;
      const name = child.name || ref?.name || `clip-${counter}`;
      if (isAudio) {
        collected.audio.push({
          id: `otio-audio-${counter}`,
          type: "audio",
          startSec,
          durationSec,
          source: url ? { kind: "file", path: url } : { kind: "silence" },
        });
      } else if (url) {
        collected.video.push({
          id: `otio-clip-${counter}`,
          type: "video",
          startSec,
          durationSec,
          source: { kind: mediaKind(url), path: url },
          sourceInSec: inSec,
          label: name,
        });
      } else {
        collected.text.push({ id: `otio-text-${counter}`, type: "text", startSec, durationSec, text: name });
      }
      cursor = round3(cursor + durationSec);
    }
  }
  return assembleTimeline(collected, {
    width: opts.width ?? 1920,
    height: opts.height ?? 1080,
    fps,
    background: opts.background ?? "0a0a0a",
  }, { source: "otio-import", name: doc.name ?? "imported", clips: collected.video.length + collected.text.length + collected.audio.length });
}

/** Import an FCPXML 1.x rough cut (Final Cut / Premiere). Carries width/height/fps in the format. */
export function fcpxmlToTimeline(content: string, opts: ImportOptions = {}): Timeline {
  const fmt = /<format\b[^>]*\bframeDuration="1\/(\d+(?:\.\d+)?)s"[^>]*>/.exec(content)
    ?? /<format\b[^>]*>/.exec(content);
  const fps = Math.round(Number(/frameDuration="1\/(\d+(?:\.\d+)?)s"/.exec(fmt?.[0] ?? "")?.[1] ?? opts.fps ?? 30));
  const width = Number(/\bwidth="(\d+)"/.exec(content)?.[1] ?? opts.width ?? 1920);
  const height = Number(/\bheight="(\d+)"/.exec(content)?.[1] ?? opts.height ?? 1080);

  // resource id -> source path
  const assets = new Map<string, string>();
  const assetRe = /<asset\b[^>]*\bid="([^"]+)"[^>]*\bsrc="file:\/\/([^"]+)"[^>]*\/?>/g;
  for (let m = assetRe.exec(content); m; m = assetRe.exec(content)) {
    assets.set(m[1]!, decodeURIComponent(m[2]!));
  }

  const collected: CollectedClips = { video: [], text: [], audio: [] };
  const spine = /<spine>([\s\S]*?)<\/spine>/.exec(content)?.[1] ?? content;
  let counter = 0;
  // asset-clip
  const clipRe = /<asset-clip\b[^>]*\bref="([^"]+)"[^>]*?(?:\boffset="([^"]*)")?[^>]*?(?:\bduration="([^"]*)")?[^>]*?(?:\bstart="([^"]*)")?[^>]*\/?>/g;
  for (let m = clipRe.exec(spine); m; m = clipRe.exec(spine)) {
    const tag = m[0]!;
    const ref = m[1]!;
    const path = assets.get(ref);
    if (!path) continue;
    counter += 1;
    const offset = rationalToSeconds(/\boffset="([^"]*)"/.exec(tag)?.[1]);
    const duration = rationalToSeconds(/\bduration="([^"]*)"/.exec(tag)?.[1]);
    const start = rationalToSeconds(/\bstart="([^"]*)"/.exec(tag)?.[1]);
    collected.video.push({
      id: `fcp-clip-${counter}`,
      type: "video",
      startSec: round3(offset),
      durationSec: round3(Math.max(0.001, duration)),
      source: { kind: mediaKind(path), path },
      sourceInSec: round3(start),
      label: path.split(/[\\/]/).pop() || `clip-${counter}`,
    });
  }
  // gaps with titles -> text clips
  const gapRe = /<gap\b[^>]*\boffset="([^"]*)"[^>]*\bduration="([^"]*)"[^>]*>([\s\S]*?)<\/gap>/g;
  for (let m = gapRe.exec(spine); m; m = gapRe.exec(spine)) {
    const offset = rationalToSeconds(m[1]);
    const duration = rationalToSeconds(m[2]);
    const titleName = /<title\b[^>]*\bname="([^"]*)"/.exec(m[3]!)?.[1];
    if (!titleName) continue;
    counter += 1;
    collected.text.push({
      id: `fcp-text-${counter}`,
      type: "text",
      startSec: round3(offset),
      durationSec: round3(Math.max(0.001, duration)),
      text: titleName,
    });
  }

  return assembleTimeline(collected, {
    width,
    height,
    fps,
    background: opts.background ?? "0a0a0a",
  }, { source: "fcpxml-import", clips: collected.video.length + collected.text.length });
}

/** Detect the interchange format from file contents. */
export function detectEditorFormat(content: string): EditorFormat | null {
  const head = content.slice(0, 4000);
  if (/"OTIO_SCHEMA"\s*:\s*"Timeline/.test(head) || (head.trimStart().startsWith("{") && head.includes("OTIO_SCHEMA"))) return "otio";
  if (/<fcpxml\b/.test(head) || /<!DOCTYPE fcpxml>/.test(head)) return "fcpxml";
  if (/^\s*TITLE:/m.test(head) && /FCM:/.test(head)) return "edl";
  return null;
}

/** Import any supported editor interchange file into the Montara Timeline IR. */
export function importTimeline(content: string, format: EditorFormat, opts: ImportOptions = {}): Timeline {
  switch (format) {
    case "edl": return edlToTimeline(content, opts);
    case "otio": return otioToTimeline(content, opts);
    case "fcpxml": return fcpxmlToTimeline(content, opts);
  }
}
