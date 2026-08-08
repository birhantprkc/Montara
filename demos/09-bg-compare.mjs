// Demo 09 — "Before / after."
//
// Demo 01 shows the finished shot. This one shows the receipt: the raw phone clip on the left, the
// same frames matted and re-staged on a San Francisco street on the right, running in sync.
//
// The two panes are each exactly half the frame wide and half tall — 960x540, the same 16:9 as both
// sources — so each side shows a *complete, uncropped* frame. A side-by-side that crops one input
// to fit is not a comparison, it is an argument.
//
// The right pane is `demos/03-relight.mp4` itself, not a re-render: the thing being compared is the
// artifact that actually ships.
import { caption, solid, timeline } from "./lib/kit.mjs";
import { deliver, contactSheet } from "./lib/render.mjs";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mediaBin, probeDuration } from "../packages/render-ffmpeg/src/index.ts";

const SOURCE = "C:\\Users\\abhin\\Downloads\\14715698_3840_2160_60fps.mp4";
const AFTER = "demos/03-relight.mp4";
const SOURCE_IN = 0.3; // matches demo 01, so both panes show the same moment

for (const required of [SOURCE, AFTER]) {
  if (!existsSync(required)) {
    console.error(`missing input: ${required}`);
    process.exit(1);
  }
}

const DUR = Math.round(probeDuration(AFTER) * 100) / 100;
const W = 1920;
const H = 1080;

/** One half-frame pane: a complete 16:9 frame at exactly half width and half height. */
function pane(path, { x, inSec = 0 }) {
  return {
    id: `pane-${x}`,
    type: "video",
    startSec: 0,
    durationSec: DUR,
    z: 10,
    source: { kind: "video", path },
    sourceInSec: inSec,
    box: { wFrac: 0.5, hFrac: 0.5 },
    transform: { x, y: H / 2 },
  };
}

const LABEL_Y = Math.round(H * 0.80);
const ir = timeline(
  [
    pane(SOURCE, { x: W * 0.25, inSec: SOURCE_IN }),
    pane(AFTER, { x: W * 0.75 }),
    // A hairline seam so the eye reads two panes rather than one broken frame.
    solid("ffffff", { start: 0, dur: DUR, z: 20, x: W / 2, y: H / 2, wFrac: 0.0016, hFrac: 0.5, opacity: 0.55 }),

    caption("BEFORE", { start: 0, dur: DUR, x: W * 0.25, y: LABEL_Y, size: 54, color: "ff9d9d", fade: 0.3 }),
    caption("phone clip, real background", { start: 0, dur: DUR, x: W * 0.25, y: LABEL_Y + 62, size: 34, color: "c8d0da", fade: 0.3 }),

    caption("AFTER", { start: 0, dur: DUR, x: W * 0.75, y: LABEL_Y, size: 54, color: "9dffcb", fade: 0.3 }),
    caption("matted, re-staged, title behind him", { start: 0, dur: DUR, x: W * 0.75, y: LABEL_Y + 62, size: 34, color: "c8d0da", fade: 0.3 }),

    caption("No green screen. No rotoscoping.", { start: 0.4, dur: DUR - 0.4, x: W / 2, y: Math.round(H * 0.135), size: 52, color: "ffffff", fade: 0.5 }),
  ],
  { dur: DUR, w: W, h: H, name: "montara demo 09 — background removal A/B" },
);

const out = deliver({ name: "09-bg-compare", timeline: ir });

// Carry demo 01's narration so the comparison explains itself; the picture is silent by design.
const withVoice = out.master.replace(/\.mp4$/, "-voiced.mp4");
const mux = spawnSync(mediaBin("ffmpeg"), [
  "-y", "-i", out.master, "-i", AFTER,
  "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-shortest", withVoice,
], { encoding: "utf8" });

const final = mux.status === 0 && existsSync(withVoice) ? withVoice : out.master;
contactSheet(final, `${out.dir}/sheet.png`, { cols: 3, rows: 2, width: 420 });
console.log(JSON.stringify({ ...out, final, dur: DUR }, null, 2));
