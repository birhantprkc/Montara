// @montara/style — output profiles (§J).
// An output profile sets the composition's dimensions/fps for a target surface. Applying one is a
// pure IR transform: it resizes the composition and re-centers any positioned text, keeping timing.

import type { Timeline } from "../../core/src/index";

export interface OutputProfile {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  aspect: string;
}

export const OUTPUT_PROFILES: OutputProfile[] = [
  { id: "youtube", name: "YouTube 16:9", width: 1920, height: 1080, fps: 30, aspect: "16:9" },
  { id: "youtube-4k", name: "YouTube 4K", width: 3840, height: 2160, fps: 30, aspect: "16:9" },
  { id: "shorts", name: "Shorts / Reels / TikTok 9:16", width: 1080, height: 1920, fps: 30, aspect: "9:16" },
  { id: "square", name: "Instagram 1:1", width: 1080, height: 1080, fps: 30, aspect: "1:1" },
  { id: "linkedin", name: "LinkedIn 16:9", width: 1200, height: 675, fps: 30, aspect: "16:9" },
  { id: "cinematic", name: "Cinematic 21:9", width: 2560, height: 1080, fps: 24, aspect: "21:9" },
];

export function listOutputProfiles(): OutputProfile[] {
  return [...OUTPUT_PROFILES];
}

export function getOutputProfile(id: string): OutputProfile | undefined {
  return OUTPUT_PROFILES.find((p) => p.id === id);
}

export function applyOutputProfile(timeline: Timeline, profileId: string): Timeline {
  const profile = getOutputProfile(profileId);
  if (!profile) throw new Error(`unknown output profile "${profileId}"`);
  return {
    ...timeline,
    composition: { ...timeline.composition, width: profile.width, height: profile.height, fps: profile.fps },
    tracks: timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.transform && (clip.transform.x != null || clip.transform.y != null)
          ? { ...clip, transform: { ...clip.transform, x: profile.width / 2, y: profile.height / 2 } }
          : clip,
      ),
    })),
    metadata: { ...timeline.metadata, outputProfile: profile.id, aspect: profile.aspect },
  };
}
