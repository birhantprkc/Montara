// Stock footage acquisition for the demo reel.
//
// Demos are rebuilt often and Pexels rate-limits, so every fetch is content-addressed into
// `out/demos/.cache`. A rebuild after the first run is offline and instant, which matters
// because the tuning loop for a composite is "render, look, nudge, render again".
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { autoMatte } from "../../packages/vision/src/index.ts";
import "./env.mjs";

export const CACHE = "out/demos/.cache";

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function pexelsKey() {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY missing — add it to .env");
  return key;
}

async function download(url, dest) {
  if (existsSync(dest)) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/**
 * Search Pexels video and return candidates sorted by how well they fit the target frame.
 *
 * `minWidth` filters the *rendition*, not the clip: Pexels serves several sizes per video and the
 * smallest one at or above our composition width is the right pick — larger renditions cost
 * download time and get scaled straight back down.
 */
export async function searchVideos(query, { orientation = "landscape", perPage = 8, minWidth = 1920 } = {}) {
  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}` +
    `&orientation=${orientation}&size=large&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey() } });
  if (!res.ok) throw new Error(`pexels ${res.status} for "${query}"`);
  const data = await res.json();
  return (data.videos ?? []).flatMap((v) => {
    const file = (v.video_files ?? [])
      .filter((f) => f.width >= minWidth)
      .sort((a, b) => a.width - b.width)[0];
    return file
      ? [{ id: v.id, w: file.width, h: file.height, durationSec: v.duration, credit: v.user?.name, page: v.url, link: file.link }]
      : [];
  });
}

/** Fetch a specific Pexels video id into the cache, picking the smallest rendition >= minWidth. */
export async function pexelsVideo(id, { minWidth = 1920, name } = {}) {
  const dest = join(CACHE, `${name ?? `pexels-${id}`}.mp4`);
  if (existsSync(dest)) return dest;
  const res = await fetch(`https://api.pexels.com/videos/videos/${id}`, {
    headers: { Authorization: pexelsKey() },
  });
  if (!res.ok) throw new Error(`pexels video ${id}: ${res.status}`);
  const v = await res.json();
  const file = (v.video_files ?? [])
    .filter((f) => f.width >= minWidth)
    .sort((a, b) => a.width - b.width)[0] ?? (v.video_files ?? []).sort((a, b) => b.width - a.width)[0];
  if (!file) throw new Error(`pexels video ${id}: no renditions`);
  return download(file.link, dest);
}

/**
 * Stills for camera-move work, cached by query.
 *
 * A push on a still only survives at delivery size if the source has resolution to spare, so this
 * asks for the original rendition and rejects anything under twice the frame width.
 */
export async function photos(query, { perPage = 8, orientation = "landscape", minWidth = 3000 } = {}) {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&orientation=${orientation}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey() } });
  if (!res.ok) throw new Error(`pexels photos ${res.status} for "${query}"`);
  const data = await res.json();
  return (data.photos ?? [])
    .filter((p) => p.width >= minWidth)
    .map((p) => ({ id: p.id, w: p.width, h: p.height, credit: p.photographer, page: p.url, link: p.src.original }));
}

/** Nth still for a query, downloaded into the cache. */
export async function still(query, { index = 0, ...opts } = {}) {
  const dest = join(CACHE, `still-${slug(query)}-${index}.jpg`);
  if (existsSync(dest)) return dest;
  const hits = await photos(query, opts);
  const pick = hits[index];
  if (!pick) throw new Error(`no still for "${query}" at index ${index}`);
  return download(pick.link, dest);
}

/** First search hit for a query, cached by query text so reruns are deterministic. */
export async function plate(query, opts = {}) {
  const dest = join(CACHE, `plate-${slug(query)}.mp4`);
  if (existsSync(dest)) return dest;
  const hits = await searchVideos(query, opts);
  const pick = hits[opts.index ?? 0];
  if (!pick) throw new Error(`no plate for "${query}"`);
  return download(pick.link, dest);
}

/**
 * Alpha matte for a subject clip, cached by (source, options).
 *
 * Matting is the slowest step in the whole reel — minutes of RVM inference — so the cache key has
 * to include the options, not just the path, or a changed maxWidth silently reuses a stale matte.
 * Calls the vision package directly rather than shelling out: the CLI would need a build step in
 * the middle of the tuning loop, and `autoMatte` already degrades gracefully on its own.
 */
export function matte(source, opts = {}) {
  const key = createHash("sha1").update(source).update(JSON.stringify(opts)).digest("hex").slice(0, 10);
  const dest = join(CACHE, `matte-${key}.mp4`);
  if (existsSync(dest)) return dest;
  mkdirSync(CACHE, { recursive: true });
  const result = autoMatte(source, { outMattePath: dest, workDir: join(CACHE, "vision"), ...opts });
  if (!result.ok || !existsSync(dest)) {
    throw new Error(
      `matte failed for ${source}: ${result.reason}\n` +
        result.attempts.map((a) => `  ${a.strategy}: ${a.reason}`).join("\n"),
    );
  }
  return dest;
}
