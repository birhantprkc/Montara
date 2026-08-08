// Demo 01 — "No green screen."
//
// A phone clip of a man walking, matted and re-staged on a real San Francisco street. The point is
// not that the background changed; it is that you stop noticing it did. Three things buy that:
// a plate with its own forward dolly so the parallax is real, a contact shadow tracking his feet,
// and a grade that pulls him toward the plate's flat overcast light.
//
// The title is the second beat: it rises out of the asphalt *behind* him, so his body cuts the
// letters. That is a z-order and a reveal mask, not a plugin.
//
// The cut is as long as the read and the title fires on the word that names it — timing a picture
// against a guessed duration is how you get a video where the voice and the visuals nearly agree.
//
// Every delivery frame is authored, not cropped: the vertical cut re-sizes the title and re-frames
// the plate, because a 9:16 crop of a 16:9 title cuts the word in half.
import { matte } from "./lib/assets.mjs";
import { groundTrack, stage } from "./lib/ground.mjs";
import { narrate, score, VOICES, cueAt } from "./lib/voice.mjs";
import { deliver, contactSheet } from "./lib/render.mjs";
import { plate, reveal, subject, contactShadow, timeline, titleSize } from "./lib/kit.mjs";

const SOURCE = "C:\\Users\\abhin\\Downloads\\14715698_3840_2160_60fps.mp4";
const PLATE = "out/plates/sf-residential.mp4";
const SOURCE_IN = 0.3;
const TITLE = "SAN FRANCISCO";
const MATTE = matte(SOURCE);

const VO_IN = 0.5;
const TAIL = 1.4; // room for the title to settle after the last word

const vo = await narrate(
  "No green screen. No rotoscoping. Montara mattes the subject, stands him on a real street, " +
    "and lifts the title out of the road behind him.",
  { voice: VOICES.george, speed: 1.05, stability: 0.45 },
);

const DUR = Math.round((VO_IN + vo.durationSec + TAIL) * 10) / 10;
const music = await score(
  "Understated modern electronic underscore for a product film. Soft pulsing synth bass, " +
    "sparse plucked motif, no drums until halfway, warm and confident, leaves room for speech.",
  DUR + 1,
);

// Fire the reveal on the word "title" so the picture lands on the read rather than near it.
const cue = cueAt(vo.words, "title") ?? { startSec: DUR * 0.55 };
const titleStart = Math.max(VO_IN + cue.startSec - 0.9, 1.0);

// Read the silhouette once; it is a property of the matte, not of the delivery frame.
const track = groundTrack(MATTE, { from: SOURCE_IN, to: SOURCE_IN + DUR, samples: 9 })
  .map((s) => ({ ...s, atSec: s.atSec - SOURCE_IN }));

/**
 * Stage the shot for a given delivery frame.
 *
 * Only two numbers are authored: how big he is in frame, and which line of asphalt his feet touch
 * on the first frame. `stage()` solves the rest from the matte, including a shadow that tracks his
 * feet and shrinks as he recedes. Taller frames see more road and less sky, so the plate's push and
 * pan move with the aspect instead of staying at the 16:9 values.
 */
function build({ w, h, aspect }) {
  const tall = h > w;
  const scale = tall ? 0.9 : 0.62;
  const feetAtY = Math.round(h * (tall ? 0.68 : 0.755));
  const ground = stage(track, { w, h, scale, feetAtY });

  const edge = Math.round(h * (tall ? 0.56 : 0.61));
  // Measured, not guessed: "SAN FRANCISCO" at the 16:9 ideal fraction runs off both edges of 9:16.
  const size = titleSize(TITLE, w, { idealFrac: aspect === "wide" ? 0.099 : 0.125 });

  return timeline(
    [
      plate(PLATE, {
        dur: DUR,
        inSec: 1.2,
        w,
        h,
        // A taller frame crops the plate horizontally, so it needs more push to keep the street wide.
        zoom: tall ? [2.1, 2.32] : [1.45, 1.62],
        panY: tall ? [0.86, 0.78] : [0.84, 0.74],
        effects: [{ type: "saturation", amount: 0.92 }],
      }),
      contactShadow({ dur: DUR, shadow: ground.shadow }),
      reveal(TITLE, {
        start: titleStart,
        dur: DUR - titleStart,
        edgePx: edge,
        restY: Math.round(edge - size * 1.0),
        riseFrom: Math.round(size * 0.75),
        size,
        x: w / 2,
        hold: 1.5,
      }),
      subject(SOURCE, MATTE, {
        dur: DUR,
        inSec: SOURCE_IN,
        scale,
        x: ground.x,
        y: ground.y,
      }),
    ],
    { dur: DUR, w, h, name: `montara demo 01 — matte + restage (${aspect})` },
  );
}

const out = deliver({
  name: "01-relight",
  build,
  frames: ["wide", "vertical", "square", "linkedin"],
  audio: { voice: [{ path: vo.path, atSec: VO_IN }], music: [{ path: music, volume: 0.5 }] },
});

contactSheet(out.master, `${out.dir}/sheet.png`);
for (const v of out.variants) contactSheet(v, v.replace(/\.mp4$/, "-sheet.png"), { cols: 3, rows: 1, width: 300 });
console.log(JSON.stringify({ ...out, dur: DUR, voDuration: vo.durationSec, titleStart }, null, 2));
