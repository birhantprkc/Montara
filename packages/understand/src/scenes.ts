// @montara/understand — scene detection (§G, real ffmpeg).
// Uses the scene-score filter + showinfo and parses cut timestamps from ffmpeg's report.

import { spawnSync } from "node:child_process";
import { mediaBin } from "../../render-ffmpeg/src/index";

export interface SceneDetectResult {
  cuts: number[];
  sceneCount: number;
  threshold: number;
}

export function detectScenes(inputPath: string, threshold = 0.2): SceneDetectResult {
  const r = spawnSync(mediaBin("ffmpeg"), [
    "-hide_banner",
    "-i", inputPath,
    "-filter:v", `select='gt(scene,${threshold})',showinfo`,
    "-an", "-f", "null", "-",
  ], { encoding: "utf8" });
  const text = r.stderr || "";
  const cuts: number[] = [];
  const re = /pts_time:([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = Number(m[1] ?? "0");
    if (Number.isFinite(t) && t > 0) cuts.push(Math.round(t * 1000) / 1000);
  }
  return { cuts, sceneCount: cuts.length + 1, threshold };
}
