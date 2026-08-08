// Demo 04 — "Type with depth."
//
// One plate, one matted subject, and a title that lives *between* them. As the camera pushes in,
// the title moves at its own rate and the subject occludes it — so the frame has three depths
// instead of the usual two (footage, then everything stapled on top).
//
// This is the shot the previous version of the reel got wrong. It looked like an overlay because
// the text sat in front of everything and slid in already-formed. Two fixes: put it below the
// subject in z, and clip it against an edge so the letters emerge.
import { matte } from "./lib/assets.mjs";
import { groundTrack, stage } from "./lib/ground.mjs";
import { narrate, score, VOICES, cueAt } from "./lib/voice.mjs";
import { deliver, contactSheet } from "./lib/render.mjs";
import { plate, reveal, subject, contactShadow, caption, timeline, titleSize } from "./lib/kit.mjs";

const SOURCE = "C:\\Users\\abhin\\Downloads\\14715698_3840_2160_60fps.mp4";
const PLATE = "out/plates/sf-residential.mp4";
const SOURCE_IN = 0.3;
const TITLE = "DEPTH";
const CAPTION = "TEXT BEHIND SUBJECT \u00b7 NO ROTOSCOPE";
const MATTE = matte(SOURCE);

const VO_IN = 0.4;
const TAIL = 1.8;

const vo = await narrate(
  "Most editors put text on top of the picture. Montara puts it inside. " +
    "The title rises out of the road, and he walks in front of it.",
  { voice: VOICES.george, speed: 1.02, stability: 0.45 },
);

const DUR = Math.round((VO_IN + vo.durationSec + TAIL) * 10) / 10;
const music = await score(
  "Warm minimal underscore, sustained analog pad, one repeating soft arpeggio, no drums, " +
    "spacious and unhurried, sits well beneath a spoken voice.",
  DUR + 1,
);

const riseCue = cueAt(vo.words, "rises") ?? { startSec: DUR * 0.55 };
const titleStart = Math.max(VO_IN + riseCue.startSec - 0.7, 1.0);

const track = groundTrack(MATTE, { from: SOURCE_IN, to: SOURCE_IN + DUR, samples: 9 })
  .map((s) => ({ ...s, atSec: s.atSec - SOURCE_IN }));

function build({ w, h, aspect }) {
  const tall = h > w;
  const scale = tall ? 0.9 : 0.62;
  const feetAtY = Math.round(h * (tall ? 0.68 : 0.755));
  const ground = stage(track, { w, h, scale, feetAtY });

  const edge = Math.round(h * (tall ? 0.56 : 0.61));
  const size = titleSize(TITLE, w, { idealFrac: aspect === "wide" ? 0.115 : 0.15 });
  const capSize = titleSize(CAPTION, w, { idealFrac: tall ? 0.036 : 0.022, insetFrac: 0.05 });

  return timeline(
    [
      plate(PLATE, {
        dur: DUR,
        inSec: 1.2,
        w,
        h,
        zoom: tall ? [2.05, 2.4] : [1.42, 1.68],
        panY: tall ? [0.86, 0.77] : [0.85, 0.73],
        effects: [{ type: "saturation", amount: 0.9 }],
      }),
      contactShadow({ dur: DUR, shadow: ground.shadow }),
      reveal(TITLE, {
        start: titleStart,
        dur: DUR - titleStart,
        edgePx: edge,
        restY: Math.round(edge - size * 1.05),
        riseFrom: Math.round(size * 0.9),
        size,
        x: w / 2,
        hold: 1.7,
        z: 12, // below the subject at z 20 — this single number is the whole trick
      }),
      subject(SOURCE, MATTE, { dur: DUR, inSec: SOURCE_IN, scale, x: ground.x, y: ground.y }),
      caption(CAPTION, {
        start: titleStart + 1.4,
        dur: DUR - titleStart - 1.4,
        y: Math.round(h * 0.93),
        x: w / 2,
        size: capSize,
        z: 900,
      }),
    ],
    { dur: DUR, w, h, name: `montara demo 04 — depth (${aspect})` },
  );
}

const out = deliver({
  name: "04-depth",
  build,
  frames: ["wide", "vertical", "square", "linkedin"],
  audio: { voice: [{ path: vo.path, atSec: VO_IN }], music: [{ path: music, volume: 0.5 }] },
});

contactSheet(out.master, `${out.dir}/sheet.png`, { cols: 3, rows: 2 });
console.log(JSON.stringify({ ...out, dur: DUR, titleStart }, null, 2));
