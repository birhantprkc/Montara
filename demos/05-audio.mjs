// Demo 05 — "Hear the difference."
//
// A take damaged on purpose — mains hum, room hiss, desk rumble — then run through Montara's
// *multiband* restoration: the recording is split at speech crossovers, each band's own noise
// floor is measured, and each band is expanded against that floor before tone and a single
// master to -14 LUFS. Loudness is the last mile, not the repair.
//
// Visually: BEFORE is one red waveform of the damaged take. AFTER stacks the four treated bands
// so the claim is readable — rumble, body, presence, air — each cleaned on its own terms. The
// audio you hear switches with the picture.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { narrate, score, VOICES } from "./lib/voice.mjs";
import { deliver, contactSheet, OUT } from "./lib/render.mjs";
import { caption, solid, timeline, titleSize } from "./lib/kit.mjs";
import { restoreVoice } from "../packages/render-ffmpeg/src/restore.ts";
import { masterAudio } from "../packages/render-ffmpeg/src/master.ts";
import { SPEECH_CROSSOVERS, bandEdges } from "../packages/render-ffmpeg/src/multiband.ts";
import { mixAudioTracks } from "../packages/providers/src/audio.ts";

const WORK = join(OUT, "05-audio", "work");
mkdirSync(WORK, { recursive: true });

function ff(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? "").slice(-800)}`);
}

const HALF = 5.0;
const BEFORE = "BEFORE \u2014 one damaged take";
const AFTER = "AFTER \u2014 four bands, each measured";
const BAND_LABELS = ["RUMBLE", "BODY", "PRESENCE", "AIR"];
const BAND_TINTS = [
  [1.0, 0.35, 0.35], // rumble — red
  [1.0, 0.72, 0.30], // body — amber
  [0.35, 0.85, 1.0], // presence — cyan
  [0.42, 1.0, 0.69], // air — green
];

const vo = await narrate(
  "This take has rumble, hum, and hiss. Montara splits it into four bands, " +
    "measures each band's own noise floor, and expands each against that floor. " +
    "Then it masters to minus fourteen LUFS.",
  { voice: VOICES.river, speed: 1.0, stability: 0.5 },
);

// Damage: 50 Hz mains, broadband hiss, low shelf for desk rumble. The restore has to earn this.
const dirty = join(WORK, "dirty.wav");
ff([
  "-i", vo.path,
  "-f", "lavfi", "-i", `sine=frequency=50:duration=${(vo.durationSec + 1).toFixed(2)}`,
  "-f", "lavfi", "-i", `anoisesrc=color=white:duration=${(vo.durationSec + 1).toFixed(2)}:amplitude=0.035`,
  "-filter_complex",
  "[1:a]volume=0.09[hum];[2:a]volume=1[hiss];" +
    "[0:a][hum][hiss]amix=inputs=3:normalize=0:duration=first,lowshelf=f=90:g=9[out]",
  "-map", "[out]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", dirty,
]);

const cleanRaw = join(WORK, "clean-raw.wav");
const restore = restoreVoice(dirty, cleanRaw, { dehum: 50, multiband: true });
const clean = join(WORK, "clean.wav");
masterAudio(cleanRaw, clean, { targetLufs: -14 });

const even = (n) => Math.round(n / 2) * 2;

/**
 * Render a waveform tinted to one hue. showwaves shades its own cline body, so we draw white and
 * tint — otherwise a "red" trace comes back as two colours.
 */
function waveform(src, outPath, { w, h, tint, band }) {
  const chain = [];
  if (band) {
    if (band.lo > 0) chain.push(`highpass=f=${band.lo}:poles=2`);
    if (band.hi != null) chain.push(`lowpass=f=${band.hi}:poles=2`);
  }
  chain.push(
    `showwaves=s=${w}x${h}:mode=cline:rate=30:colors=white:scale=sqrt`,
    "format=rgba",
    `colorchannelmixer=rr=${tint[0]}:gg=${tint[1]}:bb=${tint[2]}`,
    "format=yuv420p",
  );
  ff([
    "-i", src,
    "-filter_complex", `[0:a]${chain.join(",")}[v]`,
    "-map", "[v]", "-t", String(HALF * 2), outPath,
  ]);
  return outPath;
}

// Programme audio: dirty first half, restored second half — the ear does the A/B.
const programme = join(WORK, "programme.wav");
ff([
  "-i", dirty, "-i", clean,
  "-filter_complex",
  `[0:a]atrim=0:${HALF},asetpts=PTS-STARTPTS,afade=t=out:st=${(HALF - 0.12).toFixed(2)}:d=0.12[a];` +
    `[1:a]atrim=${HALF}:${HALF * 2},asetpts=PTS-STARTPTS,afade=t=in:d=0.12[b];[a][b]concat=n=2:v=0:a=1[out]`,
  "-map", "[out]", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", programme,
]);

const music = await score(
  "Very quiet ambient texture, single sustained low drone, almost subliminal, no rhythm, " +
    "designed to sit far behind a spoken demonstration.",
  HALF * 2 + 1,
);

const bed = join(WORK, "bed.wav");
mixAudioTracks({
  tracks: [{ path: programme, volume: 1 }, { path: music, volume: 0.16 }],
  outPath: bed,
  sidechain: true,
});

const DUR = HALF * 2;
const edges = bandEdges(SPEECH_CROSSOVERS);

function build({ w, h, aspect }) {
  const tall = h > w;
  const paneW = even(tall ? w : w / 2);
  const paneH = even(tall ? h / 2 : h);

  // BEFORE: one full-height trace of the damaged take.
  const beforeH = even(paneH * 0.55);
  const dirtyWave = waveform(dirty, join(WORK, `wave-dirty-${aspect}.mp4`), {
    w: paneW, h: beforeH, tint: [1, 0.42, 0.42],
  });

  // AFTER: four band traces stacked, each the treated band of the restored take.
  const bandH = even(paneH * 0.14);
  const bandWaves = edges.map((band, i) =>
    waveform(clean, join(WORK, `wave-band${i}-${aspect}.mp4`), {
      w: paneW, h: bandH, tint: BAND_TINTS[i], band,
    }),
  );

  const labelSize = Math.min(
    titleSize(BEFORE, paneW, { idealFrac: tall ? 0.038 : 0.046 }),
    titleSize(AFTER, paneW, { idealFrac: tall ? 0.038 : 0.046 }),
  );
  const bandLabelSize = Math.max(14, Math.round(labelSize * 0.55));

  const leftX = tall ? w / 2 : paneW / 2;
  const leftY = tall ? paneH / 2 : h / 2;
  const rightX = tall ? w / 2 : paneW + paneW / 2;
  const rightY = tall ? paneH + paneH / 2 : h / 2;

  const pane = (src, x, y, boxH, z) => ({
    id: `pane-${z}`,
    type: "video",
    startSec: 0,
    durationSec: DUR,
    z,
    source: { kind: "video", path: src },
    box: { wFrac: paneW / w, hFrac: boxH / h },
    transform: { x, y },
  });

  const bandClips = bandWaves.map((src, i) => {
    // Stack the four bands inside the AFTER pane, top to bottom.
    const stackTop = rightY - paneH * 0.22;
    const y = stackTop + i * (bandH + 6) + bandH / 2;
    return [
      pane(src, rightX, y, bandH, 20 + i),
      caption(BAND_LABELS[i], {
        start: 0.2, dur: DUR - 0.2,
        x: rightX - paneW * 0.38, y,
        size: bandLabelSize, color: "c8d0da", z: 120 + i, fade: 0.2,
      }),
    ];
  }).flat();

  return timeline(
    [
      solid("07090c", { start: 0, dur: DUR, z: 0, x: w / 2, y: h / 2 }),
      solid("1d2430", {
        start: 0, dur: DUR, z: 1,
        x: tall ? w / 2 : paneW,
        y: tall ? paneH : h / 2,
        wFrac: tall ? 1 : 2 / w,
        hFrac: tall ? 2 / h : 1,
      }),
      pane(dirtyWave, leftX, leftY, beforeH, 10),
      ...bandClips,
      caption(BEFORE, {
        start: 0.2, dur: DUR - 0.2,
        x: leftX, y: leftY - Math.round(paneH * 0.36),
        size: labelSize, color: "ff9d9d", z: 100,
      }),
      caption(AFTER, {
        start: 0.2, dur: DUR - 0.2,
        x: rightX, y: rightY - Math.round(paneH * 0.42),
        size: labelSize, color: "9dffcb", z: 101,
      }),
      // Playhead: sweeps the BEFORE pane, then the AFTER pane.
      solid("ffffff", {
        start: 0, dur: DUR, z: 200,
        x: tall ? w / 2 : paneW / 2, y: tall ? paneH / 2 : h / 2,
        wFrac: 3 / w, hFrac: beforeH / h, opacity: 0.85,
        keyframes: {
          x: [
            { atSec: 0, value: tall ? 2 : 2 },
            { atSec: HALF, value: tall ? w - 2 : paneW - 2 },
            { atSec: HALF, value: tall ? 2 : paneW + 2 },
            { atSec: DUR, value: tall ? w - 2 : w - 2 },
          ],
          y: tall
            ? [
                { atSec: 0, value: paneH / 2 },
                { atSec: HALF, value: paneH / 2 },
                { atSec: HALF, value: paneH + paneH / 2 },
                { atSec: DUR, value: paneH + paneH / 2 },
              ]
            : [{ atSec: 0, value: h / 2 }],
        },
      }),
    ],
    { dur: DUR, w, h, name: `montara demo 05 — multiband restore (${aspect})` },
  );
}

const out = deliver({
  name: "05-audio",
  build,
  frames: ["wide", "vertical", "square", "linkedin"],
  audio: { voice: [{ path: bed, atSec: 0 }] },
});

contactSheet(out.master, `${out.dir}/sheet.png`, { cols: 2, rows: 2 });
console.log(JSON.stringify({
  ...out,
  dur: DUR,
  restored: restore.ok,
  bands: restore.bands,
  tone: restore.filters,
  skipped: restore.skipped,
}, null, 2));
