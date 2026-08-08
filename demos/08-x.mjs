// Demo 08 — X SaaS product film (1:1).
//
// Not a Montara ad. A cool product demo *of X*, authored in Montara: compose, Grok rewrite,
// square media, velocity metrics, Premium analytics.
import "./lib/env.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { narrate, score, VOICES } from "./lib/voice.mjs";
import { contactSheet, mux, buildAudio, OUT } from "./lib/render.mjs";

const NAME = "08-x";
const DIR = join(OUT, NAME);
const REC = join(DIR, "recordings");
const PICTURE = join(REC, "square.mp4");
mkdirSync(REC, { recursive: true });

if (!existsSync(PICTURE)) {
  console.log("recording X product tour…");
  const r = spawnSync("node", ["record.mjs", "x.html", "square", "08-x"], {
    cwd: join(process.cwd(), "demos", "saas"),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("x UI recording failed");
}

const VO_IN = 0.28;
const TAIL = 1.1;
const vo = await narrate(
  "This is X. If it doesn’t move, it doesn’t exist. " +
    "Compose fast. Rewrite with Grok. Ship square video. " +
    "Watch velocity hit — then open Premium analytics and make more of what worked.",
  { voice: VOICES.river, speed: 1.06, stability: 0.38, style: 0.25 },
);

const pictureDur = Number.parseFloat(
  spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", PICTURE], { encoding: "utf8" }).stdout || "0",
) || 15;
const DUR = Math.round(Math.max(VO_IN + vo.durationSec + TAIL, pictureDur) * 10) / 10;

const music = await score(
  "Dark modern social product underscore, tight soft kick, neon synth motif, urgent but clean, " +
    "Twitter X launch energy, leaves room for a cool narrator.",
  DUR + 1,
);

const bed = buildAudio({
  voice: [{ path: vo.path, atSec: VO_IN }],
  music: [{ path: music, volume: 0.4 }],
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
  note: "X SaaS product demo · 1:1 · authored in Montara",
}, null, 2));
