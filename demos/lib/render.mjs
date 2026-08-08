// Delivery: composite the IR, mix the audio, master once, and cut the aspect variants.
//
// Every demo ends the same way, so it lives here rather than being copy-pasted five times.
// The aspect variants are *reframed*, not letterboxed: a 9:16 cut of a 16:9 master with black
// bars top and bottom is the tell of an automated repost, so the vertical and square deliveries
// crop to a chosen focal column and scale to fill.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compositeTimeline } from "../../packages/render-ffmpeg/src/index.ts";
import { masterAudio } from "../../packages/render-ffmpeg/src/master.ts";
import { mixAudioTracks } from "../../packages/providers/src/audio.ts";

export const OUT = "out/demos";

/** Delivery frames. `linkedin` is 4:5 — the tallest crop the feed shows without truncating. */
export const ASPECTS = {
  wide: { w: 1920, h: 1080, label: "16x9" },
  vertical: { w: 1080, h: 1920, label: "9x16" },
  square: { w: 1080, h: 1080, label: "1x1" },
  linkedin: { w: 1080, h: 1350, label: "4x5" },
};

function ff(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? r.error?.message ?? "").slice(-900)}`);
}

export function probeDuration(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
    encoding: "utf8",
  });
  return Number.parseFloat((r.stdout ?? "0").trim()) || 0;
}

/**
 * Build the audio bed for a cut: narration + score, sidechain-ducked, mastered once to -14 LUFS.
 *
 * Montara's rule is one dynamics stage and one loudness stage. Mixing then mastering keeps that
 * true; adding a second normaliser anywhere in here is what makes a mix pump.
 */
export function buildAudio({ voice = [], music = [], outPath, targetLufs = -14 }) {
  const tracks = [
    ...voice.map((v) => ({ path: v.path, volume: v.volume ?? 1, delaySec: v.atSec ?? 0 })),
    ...music.map((m) => ({ path: m.path, volume: m.volume ?? 0.55, delaySec: m.atSec ?? 0 })),
  ];
  if (!tracks.length) return null;
  mkdirSync(dirname(outPath), { recursive: true });
  const mixPath = outPath.replace(/\.wav$/, ".mix.wav");
  mixAudioTracks({ tracks, outPath: mixPath, sidechain: voice.length > 0 && music.length > 0 });
  masterAudio(mixPath, outPath, { targetLufs });
  return outPath;
}

/** Mux a mastered audio bed onto a silent picture cut. */
export function mux(videoPath, audioPath, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  ff([
    "-i", videoPath, "-i", audioPath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
    outPath,
  ]);
  return outPath;
}

/**
 * Reframe a wide master into another aspect by cropping to a focal column and scaling to fill.
 *
 * `focusX` is where the subject lives, 0..1 across the master. Centre-cropping a composition whose
 * subject sits off-centre decapitates it, which is why this is a parameter and not an assumption.
 */
export function reframe(masterPath, aspect, outPath, { focusX = 0.5, focusY = 0.5 } = {}) {
  const { w, h } = ASPECTS[aspect];
  mkdirSync(dirname(outPath), { recursive: true });
  // Crop the largest rect of the target ratio that fits, positioned at the focal point, then scale.
  const cw = `min(iw\\,ih*${w}/${h})`;
  const chh = `min(ih\\,iw*${h}/${w})`;
  ff([
    "-i", masterPath,
    "-vf",
    `crop=${cw}:${chh}:(iw-${cw})*${focusX}:(ih-${chh})*${focusY},scale=${w}:${h}:flags=lanczos,setsar=1`,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    outPath,
  ]);
  return outPath;
}

/**
 * Render one demo end to end.
 *
 * Two ways to get the other aspect ratios, and the choice matters:
 *
 *   `build`   — re-author the IR at each frame size. Titles get re-sized and re-placed, subjects
 *               get re-staged. This is the only honest option for anything with text, because a
 *               9:16 crop of a 16:9 title cuts the word in half.
 *   `aspects` — crop and scale the finished master to a focal column. Fine for a picture-only cut
 *               where nothing has to stay fully in frame.
 *
 * The IR is written next to every MP4, because the IR *is* the deliverable as far as Montara is
 * concerned — the MP4 is one compilation of it.
 */
export function deliver({ name, timeline, build, frames = [], audio, aspects = [], focus = {} }) {
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });

  const bed = audio ? buildAudio({ ...audio, outPath: join(dir, "audio.wav") }) : null;

  const cut = (ir, suffix) => {
    writeFileSync(join(dir, `${suffix ? `${name}-${suffix}` : "timeline"}.timeline.json`), JSON.stringify(ir, null, 2));
    const silent = join(dir, `.picture${suffix ? `-${suffix}` : ""}.mp4`);
    compositeTimeline(ir, silent);
    const final = join(dir, `${name}${suffix ? `-${suffix}` : ""}.mp4`);
    if (bed) return mux(silent, bed, final);
    ff(["-i", silent, "-c", "copy", final]);
    return final;
  };

  const master = cut(build ? build({ ...ASPECTS.wide, aspect: "wide" }) : timeline);

  const authored = frames
    .filter((a) => a !== "wide")
    .map((a) => cut(build({ ...ASPECTS[a], aspect: a }), ASPECTS[a].label));

  const cropped = aspects.map((a) =>
    reframe(master, a, join(dir, `${name}-${ASPECTS[a].label}.mp4`), focus[a] ?? {}),
  );

  return { dir, master, variants: [...authored, ...cropped] };
}

/**
 * Contact sheet for eyeballing a cut without scrubbing it.
 *
 * Default cell width is 720 so a 3×3 sheet is readable at a glance — 300px cells were fine for
 * spotting a black frame and useless for reading a title or judging a matte edge.
 */
export function contactSheet(videoPath, outPath, { cols = 3, rows = 3, width = 720 } = {}) {
  const dur = probeDuration(videoPath);
  const n = cols * rows;
  const every = Math.max(dur / (n + 1), 0.1);
  mkdirSync(dirname(outPath), { recursive: true });
  ff([
    "-i", videoPath,
    "-vf", `fps=1/${every.toFixed(3)},scale=${width}:-1,tile=${cols}x${rows}`,
    "-frames:v", "1",
    outPath,
  ]);
  return existsSync(outPath) ? outPath : null;
}
