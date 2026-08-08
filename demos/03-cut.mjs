// Demo 03 — "Cut on the word."
//
// A montage where every cut lands on a specific word of the narration, not on a fixed interval.
// The cut points are read out of the character-level timings ElevenLabs returns with the audio, so
// the picture turns over exactly as the sentence does. Nothing here is nudged by hand.
//
// The last beat is a J-cut: the closing shot's audio bed swells before its picture arrives, which
// is the oldest trick in the edit bay for making a cut feel motivated instead of mechanical.
import { plate as fetchPlate } from "./lib/assets.mjs";
import { narrate, score, VOICES, cueAt } from "./lib/voice.mjs";
import { deliver, contactSheet } from "./lib/render.mjs";
import { plate, caption, solid, timeline, titleSize } from "./lib/kit.mjs";

const VO_IN = 0.45;
const TAIL = 1.6;

// Each cue word names the shot it triggers. Writing the script and the shot list as one structure
// keeps them from drifting apart, which is how "nearly synced" edits happen.
//
// The cue words are spread through the sentence on purpose. Front-loading them ("traffic, water,
// steel, crowds") makes the picture fire four times in two seconds and then sit still for eight —
// technically synced, editorially useless.
const BEATS = [
  { cue: "traffic", query: "highway traffic time lapse night city", move: [1.04, 1.28], label: "CUT ON \"TRAFFIC\"" },
  { cue: "water", query: "ocean waves aerial slow motion", move: [1.3, 1.04], label: "CUT ON \"WATER\"" },
  { cue: "fire", query: "welding sparks metal workshop", move: [1.06, 1.3], label: "CUT ON \"FIRE\"" },
  { cue: "crowds", query: "crowd walking city street timelapse", move: [1.32, 1.05], label: "CUT ON \"CROWDS\"" },
];

const vo = await narrate(
  "Watch the picture change on the word. Traffic, running late into the night. " +
    "Water, moving cold and heavy. Fire, thrown off a workshop bench. " +
    "Crowds, at the turn of the hour. Not one of those cuts was placed by hand.",
  { voice: VOICES.george, speed: 1.0, stability: 0.4 },
);

const DUR = Math.round((VO_IN + vo.durationSec + TAIL) * 10) / 10;
const music = await score(
  "Tight rhythmic electronic bed with a steady eighth-note pulse and a dry kick, minimal, " +
    "modern, confident, no big melody, designed to sit under a voice.",
  DUR + 1,
);

const paths = [];
for (const beat of BEATS) paths.push(await fetchPlate(beat.query));
// The first cue word does not arrive until the third second. Something has to be on screen for the
// setup line, and it should be a shot that goes somewhere rather than a holding card.
const OPENER = await fetchPlate("empty road sunrise drone");

// Resolve each cue to a timeline second. A missing word falls back to an even split rather than
// throwing: the reel must still build if a line gets reworded.
const cuts = BEATS.map((beat, i) => {
  const hit = cueAt(vo.words, beat.cue);
  return hit ? VO_IN + hit.startSec - 0.06 : (DUR / BEATS.length) * i;
});

function build({ w, h, aspect }) {
  const tall = h > w;
  const clips = [
    plate(OPENER, {
      start: 0,
      dur: cuts[0] + 0.1,
      w,
      h,
      z: -1,
      inSec: 0.5,
      zoom: tall ? [1.68, 1.92] : [1.05, 1.2],
      effects: [{ type: "contrast", amount: 1.03 }],
    }),
  ];
  clips.push(...BEATS.flatMap((beat, i) => {
    const start = cuts[i];
    const end = i + 1 < cuts.length ? cuts[i + 1] : DUR;
    // Butt the shots with a hair of overlap so no frame of background shows through the join,
    // but never past the end of the composition.
    const dur = Math.max(Math.min(end + 0.1, DUR) - start, 0.4);
    return [
      plate(paths[i], {
        start,
        dur,
        w,
        h,
        z: i * 2,
        inSec: 0.5,
        zoom: tall ? beat.move.map((z) => z * 1.6) : beat.move,
        effects: [{ type: "contrast", amount: 1.05 }, { type: "saturation", amount: 0.95 }],
      }),
      // A short scrim under the label keeps it readable over any plate without a drop shadow halo.
      solid("000000", {
        start,
        dur: Math.min(dur, 1.0),
        z: i * 2 + 1,
        x: w / 2,
        y: Math.round(h * 0.9),
        wFrac: 1,
        hFrac: 0.11,
        opacity: 0.42,
      }),
      caption(beat.label, {
        start,
        dur: Math.min(dur, 1.0),
        y: Math.round(h * 0.9),
        x: w / 2,
        size: titleSize(beat.label, w, { idealFrac: tall ? 0.045 : 0.026, insetFrac: 0.05 }),
        z: 500 + i,
        fade: 0.18,
      }),
    ];
  }));

  return timeline(clips, { dur: DUR, w, h, name: `montara demo 03 — cut on the word (${aspect})` });
}

const out = deliver({
  name: "03-cut",
  build,
  frames: ["wide", "vertical", "square", "linkedin"],
  audio: { voice: [{ path: vo.path, atSec: VO_IN }], music: [{ path: music, volume: 0.5 }] },
});

contactSheet(out.master, `${out.dir}/sheet.png`, { cols: 4, rows: 2 });
console.log(JSON.stringify({ ...out, dur: DUR, cuts }, null, 2));
