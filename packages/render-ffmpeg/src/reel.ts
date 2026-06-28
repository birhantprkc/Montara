// @montara/render-ffmpeg — reel builder. Turns a raw vertical talking clip into a finished Reel:
// burned word-wrapped captions (timed), a hook card up top, an end/CTA card, the original audio
// kept, and a -14 LUFS loudness pass. Captions are written to per-cue text files so arbitrary
// punctuation never breaks the ffmpeg filtergraph.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mediaBin } from "./ffmpegPath";

const FONT = "C\\:/Windows/Fonts/arialbd.ttf";

export interface Caption { startSec: number; endSec: number; text: string }

export interface ReelOptions {
  hook?: string;
  endCard?: string;
  captions?: Caption[];
  /** Loudness target. */
  lufs?: number;
  /** Caption max characters per line before wrapping. */
  wrapAt?: number;
}

export interface ReelResult { ok: boolean; path: string; captions: number; error?: string }

/** Greedy word-wrap to <= maxChars per line. */
function wrap(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ` ${w}`;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/** Build a finished Reel from a (vertical) source clip. */
export function buildReel(input: string, outPath: string, opts: ReelOptions = {}): ReelResult {
  const ff = mediaBin("ffmpeg");
  const ffprobe = mediaBin("ffprobe");
  const lufs = opts.lufs ?? -14;
  const wrapAt = opts.wrapAt ?? 22;
  mkdirSync(dirname(outPath), { recursive: true });
  const work = join(tmpdir(), `montara-reel-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });

  // probe size + duration to place elements
  const probe = spawnSync(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", input], { encoding: "utf8" });
  let W = 1080, H = 1920, dur = 0;
  try {
    const j = JSON.parse(probe.stdout || "{}") as { streams?: { width: number; height: number }[]; format?: { duration?: string } };
    if (j.streams?.[0]) { W = j.streams[0].width; H = j.streams[0].height; }
    dur = parseFloat(j.format?.duration ?? "0") || 0;
  } catch { /* defaults */ }

  const drawtexts: string[] = [];
  const capSize = Math.round(H * 0.040);
  const capY = Math.round(H * 0.70);

  (opts.captions ?? []).forEach((c, i) => {
    const file = join(work, `cap-${i}.txt`);
    writeFileSync(file, wrap(c.text, wrapAt));
    const tf = file.replace(/\\/g, "/").replace(/:/g, "\\:");
    drawtexts.push(
      `drawtext=fontfile='${FONT}':textfile='${tf}':fontcolor=white:fontsize=${capSize}:x=(w-text_w)/2:y=${capY}:line_spacing=8` +
      `:box=1:boxcolor=black@0.55:boxborderw=18:enable='between(t,${c.startSec.toFixed(2)},${c.endSec.toFixed(2)})'`,
    );
  });

  if (opts.hook) {
    const file = join(work, "hook.txt");
    writeFileSync(file, wrap(opts.hook, 18));
    const tf = file.replace(/\\/g, "/").replace(/:/g, "\\:");
    drawtexts.push(
      `drawtext=fontfile='${FONT}':textfile='${tf}':fontcolor=yellow:fontsize=${Math.round(H * 0.058)}:x=(w-text_w)/2:y=${Math.round(H * 0.10)}:line_spacing=8` +
      `:box=1:boxcolor=black@0.45:boxborderw=20:shadowcolor=black:shadowx=3:shadowy=3:enable='between(t,0,2.6)'`,
    );
  }

  if (opts.endCard && dur > 3) {
    const file = join(work, "end.txt");
    writeFileSync(file, wrap(opts.endCard, 16));
    const tf = file.replace(/\\/g, "/").replace(/:/g, "\\:");
    drawtexts.push(
      `drawtext=fontfile='${FONT}':textfile='${tf}':fontcolor=white:fontsize=${Math.round(H * 0.06)}:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=10` +
      `:box=1:boxcolor=black@0.6:boxborderw=24:enable='between(t,${(dur - 3).toFixed(2)},${dur.toFixed(2)})'`,
    );
  }

  const vf = drawtexts.length ? drawtexts.join(",") + ",format=yuv420p" : "format=yuv420p";
  const af = `loudnorm=I=${lufs}:TP=-1:LRA=11`;

  const r = spawnSync(ff, [
    "-y", "-i", input,
    "-vf", vf, "-af", af,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    outPath,
  ], { encoding: "utf8", timeout: 600000, maxBuffer: 1 << 26 });

  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
  if (r.status !== 0) return { ok: false, path: outPath, captions: opts.captions?.length ?? 0, error: (r.stderr || "").slice(-500) };
  return { ok: true, path: outPath, captions: opts.captions?.length ?? 0 };
}
