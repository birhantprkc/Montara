// Platform media profiles and FFmpeg argument helpers.

export type AspectRatio = "16:9" | "9:16" | "1:1" | "21:9" | "4:3";

export interface MediaProfile {
  name: string;
  width: number;
  height: number;
  aspect_ratio: AspectRatio;
  fps: number;
  codec: string;
  audio_codec: string;
  crf: number;
  pixel_format: string;
  max_file_size_mb: number | null;
  max_duration_seconds: number | null;
  caption_format: string;
  notes: string;
}

function mediaProfile(input: Omit<MediaProfile, "pixel_format" | "max_file_size_mb" | "max_duration_seconds" | "caption_format" | "notes"> & Partial<Pick<MediaProfile, "pixel_format" | "max_file_size_mb" | "max_duration_seconds" | "caption_format" | "notes">>): MediaProfile {
  return {
    pixel_format: "yuv420p",
    max_file_size_mb: null,
    max_duration_seconds: null,
    caption_format: "srt",
    notes: "",
    ...input,
  };
}

export const YOUTUBE_LANDSCAPE = mediaProfile({
  name: "youtube_landscape",
  width: 1920,
  height: 1080,
  aspect_ratio: "16:9",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 18,
  notes: "YouTube standard HD upload",
});

export const YOUTUBE_4K = mediaProfile({
  name: "youtube_4k",
  width: 3840,
  height: 2160,
  aspect_ratio: "16:9",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 18,
  notes: "YouTube 4K upload",
});

export const YOUTUBE_SHORTS = mediaProfile({
  name: "youtube_shorts",
  width: 1080,
  height: 1920,
  aspect_ratio: "9:16",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 20,
  max_duration_seconds: 60,
  notes: "YouTube Shorts (max 60s, vertical)",
});

export const INSTAGRAM_REELS = mediaProfile({
  name: "instagram_reels",
  width: 1080,
  height: 1920,
  aspect_ratio: "9:16",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 20,
  max_file_size_mb: 250,
  max_duration_seconds: 90,
  notes: "Instagram Reels (max 90s, vertical)",
});

export const INSTAGRAM_FEED = mediaProfile({
  name: "instagram_feed",
  width: 1080,
  height: 1080,
  aspect_ratio: "1:1",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 20,
  max_file_size_mb: 250,
  max_duration_seconds: 60,
  notes: "Instagram feed video (square)",
});

export const TIKTOK = mediaProfile({
  name: "tiktok",
  width: 1080,
  height: 1920,
  aspect_ratio: "9:16",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 20,
  max_file_size_mb: 287,
  max_duration_seconds: 600,
  notes: "TikTok (max 10min, vertical preferred)",
});

export const LINKEDIN = mediaProfile({
  name: "linkedin",
  width: 1920,
  height: 1080,
  aspect_ratio: "16:9",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 20,
  max_file_size_mb: 5120,
  max_duration_seconds: 600,
  notes: "LinkedIn video (landscape preferred, max 10min)",
});

export const CINEMATIC = mediaProfile({
  name: "cinematic",
  width: 2560,
  height: 1080,
  aspect_ratio: "21:9",
  fps: 24,
  codec: "libx264",
  audio_codec: "aac",
  crf: 16,
  notes: "Cinematic ultra-wide format",
});

export const GENERIC_HD = mediaProfile({
  name: "generic_hd",
  width: 1920,
  height: 1080,
  aspect_ratio: "16:9",
  fps: 30,
  codec: "libx264",
  audio_codec: "aac",
  crf: 23,
  notes: "Generic HD output (no platform-specific constraints)",
});

export const ALL_PROFILES: Record<string, MediaProfile> = Object.fromEntries(
  [
    YOUTUBE_LANDSCAPE,
    YOUTUBE_4K,
    YOUTUBE_SHORTS,
    INSTAGRAM_REELS,
    INSTAGRAM_FEED,
    TIKTOK,
    LINKEDIN,
    CINEMATIC,
    GENERIC_HD,
  ].map((profile) => [profile.name, profile]),
);

export function getProfile(name: string): MediaProfile {
  const profile = ALL_PROFILES[name];
  if (!profile) {
    const available = Object.keys(ALL_PROFILES).join(", ");
    throw new Error(`Unknown profile '${name}'. Available: ${available}`);
  }
  return profile;
}

export function getProfilesForPlatform(platform: string): MediaProfile[] {
  return Object.entries(ALL_PROFILES)
    .filter(([name]) => name.startsWith(platform))
    .map(([, profile]) => profile);
}

export function ffmpegOutputArgs(profile: MediaProfile): string[] {
  return [
    "-c:v", profile.codec,
    "-c:a", profile.audio_codec,
    "-crf", String(profile.crf),
    "-pix_fmt", profile.pixel_format,
    "-r", String(profile.fps),
    "-vf", `scale=${profile.width}:${profile.height}`,
  ];
}
