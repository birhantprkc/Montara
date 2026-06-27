// @montara/style — style playbooks (§J).
// A playbook is a typography/color/motion/audio profile. Applying one is a pure transform on the
// Timeline IR: it restyles text clips and sets the composition background, leaving timing intact.

import type { Timeline } from "../../core/src/index";

export interface StylePlaybook {
  id: string;
  name: string;
  typography: { fontFamily: string; titleScalePct: number };
  color: { background: string; textColor: string; palette: string[] };
  motion: { transition: "cut" | "fade" | "crossfade"; pace: "calm" | "measured" | "punchy" };
  audio: { targetLufs: number; musicGainDb: number };
}

export const STYLE_PLAYBOOKS: StylePlaybook[] = [
  {
    id: "clean-professional",
    name: "Clean Professional",
    typography: { fontFamily: "Inter", titleScalePct: 7.8 },
    color: { background: "0a0f1a", textColor: "ffffff", palette: ["0a0f1a", "13233b", "1f4d4a"] },
    motion: { transition: "fade", pace: "measured" },
    audio: { targetLufs: -14, musicGainDb: -18 },
  },
  {
    id: "flat-motion",
    name: "Flat Motion Graphics",
    typography: { fontFamily: "Poppins", titleScalePct: 9 },
    color: { background: "111111", textColor: "f5f5f5", palette: ["ff5252", "ffb142", "34ace0"] },
    motion: { transition: "crossfade", pace: "punchy" },
    audio: { targetLufs: -14, musicGainDb: -14 },
  },
  {
    id: "minimalist-diagram",
    name: "Minimalist Diagram",
    typography: { fontFamily: "IBM Plex Sans", titleScalePct: 6.5 },
    color: { background: "fafafa", textColor: "111111", palette: ["111111", "6b7280", "2563eb"] },
    motion: { transition: "cut", pace: "calm" },
    audio: { targetLufs: -16, musicGainDb: -22 },
  },
];

export function listStyles(): StylePlaybook[] {
  return [...STYLE_PLAYBOOKS];
}

export function getStyle(id: string): StylePlaybook | undefined {
  return STYLE_PLAYBOOKS.find((s) => s.id === id);
}

export function applyStyle(timeline: Timeline, styleId: string): Timeline {
  const style = getStyle(styleId);
  if (!style) throw new Error(`unknown style "${styleId}"`);
  return {
    ...timeline,
    composition: { ...timeline.composition, background: style.color.background },
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.type === "text"
          ? { ...clip, style: { ...clip.style, fontFamily: style.typography.fontFamily, color: style.color.textColor } }
          : clip,
      ),
    })),
    metadata: { ...timeline.metadata, style: style.id },
  };
}
