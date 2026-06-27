// @montara/understand — media probe (ffprobe).

import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";

export interface MediaInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export function probeMediaInfo(path: string): MediaInfo {
  const r = spawnSync(mediaBin("ffprobe"), [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json",
    path,
  ], { encoding: "utf8" });
  const info: MediaInfo = { durationSec: 0, width: 0, height: 0, hasAudio: false };
  try {
    const data = JSON.parse(r.stdout || "{}") as {
      streams?: { codec_type?: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    for (const s of data.streams ?? []) {
      if (s.codec_type === "video") { info.width = s.width ?? info.width; info.height = s.height ?? info.height; }
      if (s.codec_type === "audio") info.hasAudio = true;
    }
    info.durationSec = parseFloat(data.format?.duration ?? "0") || 0;
  } catch { /* leave defaults */ }
  return info;
}
