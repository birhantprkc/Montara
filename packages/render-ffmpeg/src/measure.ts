// Text measurement for drawtext.
//
// drawtext exposes `text_w` to its own expressions but never to the caller, so an author who wants
// a title to fit the frame has to guess a point size. Guessing is why the same title reads as
// designed at 16:9 and runs off both edges at 9:16 — the per-character advance of a string swings
// from about 0.59em ("STILLS THAT MOVE") to 0.71em ("MONTARA") in the same face.
//
// So: draw the string once at a reference size, scan the raster for ink, and scale. drawtext advance
// is linear in fontsize, so one measurement answers every size. Results are cached because the
// measurement costs an ffmpeg process and a multi-aspect delivery asks for the same string per frame.
import { spawnSync } from "node:child_process";
import { drawtextFont, type DrawtextFontOptions } from "./font";

/** Reference size to rasterise at. Large enough that rounding is noise, small enough to stay quick. */
const REF_SIZE = 100;
const INK_THRESHOLD = 40;

const cache = new Map<string, number>();

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
}

/**
 * Ink width in pixels of `text` drawn at `fontSize`.
 *
 * Returns an estimate rather than throwing if ffmpeg is unavailable or draws nothing: a title that
 * is slightly the wrong size is a worse outcome than a crash only in a world where renders never
 * run headless, and Montara's rule is that no stage hard-fails.
 */
export function measureTextWidth(text: string, fontSize: number, options: DrawtextFontOptions = {}): number {
  if (!text) return 0;
  const key = `${options.fontFile ?? ""}|${options.fontFamily ?? ""}|${text}`;
  let refWidth = cache.get(key);

  if (refWidth === undefined) {
    // Leave room for the widest plausible face before clipping the canvas would corrupt the answer.
    const canvasW = Math.ceil(text.length * REF_SIZE * 1.6) + 200;
    const canvasH = REF_SIZE * 3;
    const result = spawnSync(
      "ffmpeg",
      [
        "-v", "error", "-y",
        "-f", "lavfi", "-i", `color=c=black:s=${canvasW}x${canvasH}:d=0.04`,
        "-vf",
        `drawtext=${drawtextFont(options)}:text='${escapeText(text)}':fontcolor=white:fontsize=${REF_SIZE}:x=100:y=${REF_SIZE}`,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-",
      ],
      { maxBuffer: 1 << 28 },
    );

    const raster = result.stdout;
    let min = canvasW;
    let max = -1;
    if (result.status === 0 && raster && raster.length >= canvasW * canvasH) {
      for (let y = 0; y < canvasH; y += 1) {
        const row = y * canvasW;
        for (let x = 0; x < canvasW; x += 1) {
          if (raster[row + x] > INK_THRESHOLD) {
            if (x < min) min = x;
            if (x > max) max = x;
          }
        }
      }
    }
    // 0.62em/char is the mean across the uppercase strings these titles use — only reached when the
    // rasteriser could not be run at all.
    refWidth = max < 0 ? text.length * REF_SIZE * 0.62 : max - min + 1;
    cache.set(key, refWidth);
  }

  return (refWidth * fontSize) / REF_SIZE;
}

/**
 * Largest integer font size at which `text` fits `maxWidth`.
 *
 * `max` is the size you would use if the string were short; this only ever shrinks it. That
 * asymmetry is deliberate — a title should keep its designed size until the frame forces a change.
 */
export function fitFontSize(
  text: string,
  maxWidth: number,
  { max, min = 8, ...font }: { max: number; min?: number } & DrawtextFontOptions,
): number {
  const atMax = measureTextWidth(text, max, font);
  if (atMax <= maxWidth) return max;
  return Math.max(min, Math.floor((max * maxWidth) / atMax));
}
