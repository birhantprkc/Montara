// Demo 02 — "Stills that move."
//
// Six photographs, no video. Every shot is a camera move *inside* the still: a push, a drift, a
// pull-back. That is `zoompan` driven by keyframed zoom/panX/panY on the Timeline IR, so the same
// move survives a re-render at any frame size.
//
// The thing that separates this from a slideshow with the Ken Burns box ticked is that the moves
// are *directed*: each one has a heading, consecutive shots move in opposite directions so the cut
// has energy, and every cut lands on a beat of the read rather than on a fixed interval.
import { still } from "./lib/assets.mjs";
import { narrate, score, VOICES } from "./lib/voice.mjs";
import { deliver, contactSheet } from "./lib/render.mjs";
import { plate, caption, solid, timeline, titleSize } from "./lib/kit.mjs";

const VO_IN = 0.4;
const TAIL = 1.2;
const CAPTION = "SIX PHOTOGRAPHS \u00b7 ZERO VIDEO";

const vo = await narrate(
  "These are photographs. Not one frame of video. " +
    "Montara flies a camera through each still — push, drift, pull back — and cuts on the beat.",
  { voice: VOICES.george, speed: 1.06, stability: 0.42 },
);

const DUR = Math.round((VO_IN + vo.durationSec + TAIL) * 10) / 10;
const music = await score(
  "Cinematic ambient underscore, slow swelling pad, single low piano note motif, restrained, " +
    "builds gently, no percussion until the last third, leaves headroom for narration.",
  DUR + 1,
);

// Six plates, each with a heading. Alternating directions keep consecutive cuts from feeling like
// the same move repeated — the eye reads a reversal as a new shot, not a continuation.
const SHOTS = [
  { query: "aerial city skyline dusk", move: "pushIn", label: null },
  { query: "mountain range fog aerial", move: "driftRight", label: null },
  { query: "desert dunes aerial", move: "pullBack", label: null },
  { query: "coastline waves aerial", move: "driftLeft", label: null },
  { query: "forest canopy aerial", move: "pushIn", label: null },
  { query: "city street night long exposure", move: "pullBack", label: null },
];

const MOVES = {
  pushIn: { zoom: [1.02, 1.34], panX: [0.5, 0.5], panY: [0.55, 0.42] },
  pullBack: { zoom: [1.38, 1.04], panX: [0.5, 0.5], panY: [0.45, 0.55] },
  driftRight: { zoom: [1.22, 1.3], panX: [0.28, 0.72], panY: [0.5, 0.5] },
  driftLeft: { zoom: [1.3, 1.22], panX: [0.74, 0.26], panY: [0.5, 0.5] },
};

const paths = [];
for (const [i, shot] of SHOTS.entries()) paths.push(await still(shot.query, { index: i % 3 }));

// Cut on words. Six shots across the read means the picture turns over when the sentence does,
// which is the whole reason we asked for character-level timings in the first place.
const perShot = DUR / SHOTS.length;
const OVERLAP = 0.12; // shots butt up with a hair of overlap so no frame of background shows through

function build({ w, h, aspect }) {
  const clips = SHOTS.flatMap((shot, i) => {
    const start = i * perShot;
    const dur = perShot + (i < SHOTS.length - 1 ? OVERLAP : 0);
    const move = MOVES[shot.move];
    return [
      plate(paths[i], {
        kind: "image",
        start,
        dur,
        w,
        h,
        z: i,
        // Tall frames crop a landscape still hard, so they need extra push to stay filled.
        zoom: h > w ? move.zoom.map((z) => z * 1.55) : move.zoom,
        panX: move.panX,
        panY: move.panY,
        effects: [{ type: "contrast", amount: 1.04 }],
      }),
    ];
  });

  // Sized against the frame it lands in, not against the 16:9 master: the same fraction of width
  // that reads at 1920 is 30px at 1080, which is unreadable over a busy plate.
  const capY = Math.round(h * 0.88);
  const capSize = titleSize(CAPTION, w, { idealFrac: h > w ? 0.05 : 0.028, insetFrac: 0.05 });
  clips.push(
    // These plates are foliage and city at every luminance, so the label needs a surface to sit on
    // rather than a drop shadow fighting the texture behind it.
    solid("000000", {
      start: DUR - 2.6, dur: 2.6, z: 199,
      x: w / 2, y: capY, wFrac: 1, hFrac: (capSize * 2.1) / h, opacity: 0.4,
      // Match the caption's fade, or the surface pops in a third of a second before the words.
      keyframes: {
        opacity: [
          { atSec: DUR - 2.6, value: 0 },
          { atSec: DUR - 2.25, value: 0.4, easing: "ease-out" },
          { atSec: DUR - 0.35, value: 0.4 },
          { atSec: DUR, value: 0, easing: "ease-in" },
        ],
      },
    }),
    caption(CAPTION, { start: DUR - 2.6, dur: 2.6, y: capY, x: w / 2, size: capSize, z: 200 }),
  );

  return timeline(clips, { dur: DUR, w, h, name: `montara demo 02 — camera on stills (${aspect})` });
}

const out = deliver({
  name: "02-camera",
  build,
  frames: ["wide", "vertical", "square", "linkedin"],
  audio: { voice: [{ path: vo.path, atSec: VO_IN }], music: [{ path: music, volume: 0.55 }] },
});

contactSheet(out.master, `${out.dir}/sheet.png`, { cols: 3, rows: 2 });
console.log(JSON.stringify({ ...out, dur: DUR, perShot }, null, 2));
