// Demo 07 — LinkedIn SaaS product film (4:5).
//
// Not a Montara ad. A cool product demo *of LinkedIn*, authored in Montara: AI compose,
// native 4:5 video in the feed, creator analytics, Premium CTA.
import "./lib/env.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { narrate, score, VOICES } from "./lib/voice.mjs";
import { contactSheet, mux, buildAudio, OUT } from "./lib/render.mjs";

const NAME = "07-linkedin";
const DIR = join(OUT, NAME);
const REC = join(DIR, "recordings");
const PICTURE = join(REC, "linkedin.mp4");
mkdirSync(REC, { recursive: true });

if (!existsSync(PICTURE)) {
  console.log("recording LinkedIn product tour…");
  const r = spawnSync("node", ["record.mjs", "linkedin.html", "linkedin", "07-linkedin"], {
    cwd: join(process.cwd(), "demos", "saas"),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("linkedin UI recording failed");
}

const VO_IN = 0.3;
const TAIL = 1.2;
const vo = await narrate(
  "This is LinkedIn — rebuilt for creators who ship video. " +
    "Draft with AI. Post native four-by-five. Watch reach compound in real time. " +
    "Premium that actually earns its keep.",
  { voice: VOICES.sarah, speed: 1.03, stability: 0.4, style: 0.2 },
);

const pictureDur = Number.parseFloat(
  spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", PICTURE], { encoding: "utf8" }).stdout || "0",
) || 16;
const DUR = Math.round(Math.max(VO_IN + vo.durationSec + TAIL, pictureDur) * 10) / 10;

const music = await score(
  "Clean modern corporate product underscore, soft pulse, confident and bright, " +
    "LinkedIn launch energy, no heavy drums, space for a female narrator.",
  DUR + 1,
);

const bed = buildAudio({
  voice: [{ path: vo.path, atSec: VO_IN }],
  music: [{ path: music, volume: 0.38 }],
  outPath: join(DIR, "audio.wav"),
});

function finish(picture, outPath) {
  const timed = outPath.replace(/\.mp4$/, ".timed.mp4");
  const audioPad = outPath.replace(/\.mp4$/, ".audio.wav");
  spawnSync("ffmpeg", [
    "-y", "-v", "error", "-i", picture,
    "-vf", `tpad=stop_mode=clone:stop_duration=3,trim=duration=${DUR},setpts=PTS-STARTPTS`,
    "-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", timed,
  ], { encoding: "utf8" });
  spawnSync("ffmpeg", [
    "-y", "-v", "error", "-i", bed,
    "-af", `apad=whole_dur=${DUR}`, "-t", String(DUR),
    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", audioPad,
  ], { encoding: "utf8" });
  return mux(timed, audioPad, outPath);
}

const master = finish(PICTURE, join(DIR, `${NAME}.mp4`));
contactSheet(master, join(DIR, "sheet.png"), { cols: 3, rows: 2 });
console.log(JSON.stringify({
  dir: DIR,
  master,
  dur: DUR,
  voDuration: vo.durationSec,
  note: "LinkedIn SaaS product demo · 4:5 · authored in Montara",
}, null, 2));
