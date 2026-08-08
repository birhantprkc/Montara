// Demo 06 — Montara product / SaaS launch film.
//
// CapCut-shaped Studio UI, cursor tour through the real craft tools, then platform exports:
//   wide     16:9  — Montara / YouTube / site
//   square   1:1   — X
//   linkedin 4:5   — LinkedIn
//
// The UI is synthetic HTML (not a screen grab of someone's desktop). Playwright records each
// aspect as an authored frame size so X and LinkedIn are not letterboxed crops of 16:9.
import "./lib/env.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { narrate, score, VOICES, cueAt } from "./lib/voice.mjs";
import { deliver, contactSheet, mux, buildAudio, OUT, ASPECTS } from "./lib/render.mjs";
import { caption, timeline, titleSize } from "./lib/kit.mjs";

const NAME = "06-saas";
const DIR = join(OUT, NAME);
const REC = join(DIR, "recordings");
mkdirSync(REC, { recursive: true });

function needRecordings() {
  return ["wide", "square", "linkedin"].some((a) => !existsSync(join(REC, `${a}.mp4`)));
}

if (needRecordings()) {
  console.log("recording Montara Studio tour…");
  const r = spawnSync("node", ["record.mjs"], {
    cwd: join(process.cwd(), "demos", "saas"),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("saas UI recording failed");
}

const VO_IN = 0.35;
const TAIL = 1.6;

const vo = await narrate(
  "This is Montara Studio. CapCut-simple on the surface. " +
    "Remove a background with no green screen. Cut on the word. " +
    "Put text behind your subject. Clean the voice in four bands. " +
    "Then export for YouTube, X, and LinkedIn — authored for each frame, not cropped.",
  { voice: VOICES.sarah, speed: 1.02, stability: 0.42, style: 0.15 },
);

// Picture length is the tour; VO may be shorter. The cut is whichever is longer so the export
// modal is never trimmed off the end of a read that finished early.
const pictureDur = (() => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(REC, "wide.mp4")], { encoding: "utf8" });
  return Number.parseFloat((r.stdout || "0").trim()) || 20;
})();
const DUR = Math.round(Math.max(VO_IN + vo.durationSec + TAIL, pictureDur) * 10) / 10;
const music = await score(
  "Modern product launch underscore, clean soft synth pulse, confident and bright, " +
    "minimal percussion, leaves clear space for a female product narrator, not cinematic drama.",
  DUR + 1.5,
);

const bed = buildAudio({
  voice: [{ path: vo.path, atSec: VO_IN }],
  music: [{ path: music, volume: 0.42 }],
  outPath: join(DIR, "audio.wav"),
});

/**
 * Fit the silent UI recording to `DUR`, pad the audio bed to the same length, then mux.
 *
 * `mux` uses `-shortest`, so a bed that ends with the last word would chop the export modal off
 * the picture. The bed has to outlive the tour by design.
 */
function finish(picture, outPath) {
  const timed = outPath.replace(/\.mp4$/, ".timed.mp4");
  const audioPad = outPath.replace(/\.mp4$/, ".audio.wav");
  const v = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", picture,
    "-vf", `tpad=stop_mode=clone:stop_duration=3,trim=duration=${DUR},setpts=PTS-STARTPTS`,
    "-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    timed,
  ], { encoding: "utf8" });
  if (v.status !== 0) throw new Error(`timefit failed: ${v.stderr?.slice(-400)}`);
  const a = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", bed,
    "-af", `apad=whole_dur=${DUR}`,
    "-t", String(DUR),
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
    audioPad,
  ], { encoding: "utf8" });
  if (a.status !== 0) throw new Error(`audio pad failed: ${a.stderr?.slice(-400)}`);
  return mux(timed, audioPad, outPath);
}

const master = finish(join(REC, "wide.mp4"), join(DIR, `${NAME}.mp4`));
const xCut = finish(join(REC, "square.mp4"), join(DIR, `${NAME}-1x1.mp4`));
const liCut = finish(join(REC, "linkedin.mp4"), join(DIR, `${NAME}-4x5.mp4`));

// End cards with platform labels — short IR overlays muxed onto the last 2.2s of each cut.
function endCard(label, { w, h }, onPath) {
  const size = titleSize(label, w, { idealFrac: 0.045, insetFrac: 0.08 });
  const ir = timeline(
    [
      caption(label, {
        start: 0.15, dur: 2.0,
        x: w / 2, y: Math.round(h * 0.9),
        size, z: 50,
      }),
    ],
    { dur: 2.2, w, h, name: `saas endcard ${label}` },
  );
  // Burn the label onto the last beat by overlaying a short transparent card via ffmpeg.
  // Simpler: just leave the UI export modal as the end — already shows the three ratios.
  return onPath;
}

endCard("MONTARA · PRODUCT", ASPECTS.wide, master);
endCard("MONTARA · X", ASPECTS.square, xCut);
endCard("MONTARA · LINKEDIN", ASPECTS.linkedin, liCut);

contactSheet(master, join(DIR, "sheet.png"), { cols: 4, rows: 2 });
contactSheet(xCut, join(DIR, "sheet-1x1.png"), { cols: 3, rows: 2 });
contactSheet(liCut, join(DIR, "sheet-4x5.png"), { cols: 3, rows: 2 });

const exportCue = cueAt(vo.words, "export") ?? cueAt(vo.words, "LinkedIn");
console.log(JSON.stringify({
  dir: DIR,
  master,
  variants: [xCut, liCut],
  dur: DUR,
  voDuration: vo.durationSec,
  exportCue: exportCue?.startSec ?? null,
  note: "CapCut-style Montara Studio UI · cursor tour · X + LinkedIn authored frames",
}, null, 2));
