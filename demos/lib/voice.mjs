// ElevenLabs narration, score and SFX for the demo reel.
//
// Everything is content-addressed into `out/demos/.cache`: a rebuild that did not change the line
// costs nothing and burns no quota. Narration is fetched *with timestamps* — the character-level
// alignment is what lets a visual cut land on the word instead of on a guessed duration, which is
// the difference between a cut that feels scored and one that feels approximate.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./assets.mjs";

const API = "https://api.elevenlabs.io/v1";

/** Voices picked off the account, matched to the register each cut needs. */
export const VOICES = {
  /** British, measured, documentary authority. The house narrator. */
  george: "JBFqnCBsd6RMkjVDRZzb",
  /** American, warm and product-y. Launch films. */
  sarah: "EXAVITQu4vr4xnSDxMaL",
  /** Neutral, calm, explanatory. Feature walkthroughs. */
  river: "SAz9YHcvj6GT2YYXdXww",
};

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY missing — add it to .env");
  return k;
}

function cachePath(kind, seed, ext) {
  mkdirSync(CACHE, { recursive: true });
  return join(CACHE, `${kind}-${createHash("sha1").update(seed).digest("hex").slice(0, 12)}.${ext}`);
}

function toWav(src) {
  const dest = src.replace(/\.mp3$/, ".wav");
  if (existsSync(dest)) return dest;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ar", "48000", "-ac", "2", dest], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`ffmpeg wav convert failed: ${r.stderr?.slice(-400)}`);
  return dest;
}

/**
 * Narrate a line and return `{ path, durationSec, words }`.
 *
 * `words` carries a start/end second for every word, derived from ElevenLabs' character alignment.
 * Build the picture against these and the edit is locked to the read, not to an estimate.
 */
export async function narrate(text, { voice = VOICES.george, speed = 1.0, stability = 0.4, style = 0.0 } = {}) {
  const seed = JSON.stringify({ text, voice, speed, stability, style });
  const metaPath = cachePath("vo", seed, "json");
  const mp3Path = metaPath.replace(/\.json$/, ".mp3");

  if (!existsSync(metaPath)) {
    const res = await fetch(`${API}/text-to-speech/${voice}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability, similarity_boost: 0.8, style, speed, use_speaker_boost: true },
      }),
    });
    if (!res.ok) throw new Error(`elevenlabs tts ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    writeFileSync(mp3Path, Buffer.from(body.audio_base64, "base64"));
    writeFileSync(metaPath, JSON.stringify({ text, alignment: body.alignment }));
  }

  const { alignment } = JSON.parse(readFileSync(metaPath, "utf8"));
  return { path: toWav(mp3Path), ...wordsFromAlignment(alignment, text) };
}

/**
 * Collapse per-character alignment into word spans.
 *
 * ElevenLabs times every character including the spaces; a word is therefore the run between
 * whitespace, starting at its first character and ending at its last.
 */
function wordsFromAlignment(alignment, text) {
  const chars = alignment?.characters ?? [...text];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const words = [];
  let current = null;
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (/\s/.test(c)) {
      if (current) words.push(current);
      current = null;
      continue;
    }
    if (!current) current = { word: "", startSec: starts[i] ?? 0, endSec: ends[i] ?? 0 };
    current.word += c;
    current.endSec = ends[i] ?? current.endSec;
  }
  if (current) words.push(current);
  return { words, durationSec: ends.length ? ends[ends.length - 1] : 0 };
}

/** Find when a phrase lands in a narration, so a visual beat can be pinned to it. */
export function cueAt(words, phrase) {
  const target = phrase.toLowerCase().split(/\s+/);
  const bare = (w) => w.word.toLowerCase().replace(/[^a-z0-9']/g, "");
  for (let i = 0; i + target.length <= words.length; i += 1) {
    if (target.every((t, j) => bare(words[i + j]) === t.replace(/[^a-z0-9']/g, ""))) {
      return { startSec: words[i].startSec, endSec: words[i + target.length - 1].endSec };
    }
  }
  return null;
}

/** Compose a bespoke score cue. A written brief beats a stock bed because it can hit our beats. */
export async function score(prompt, seconds) {
  const dest = cachePath("music", `${prompt}|${seconds}`, "mp3");
  if (!existsSync(dest)) {
    const res = await fetch(`${API}/music`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: Math.round(seconds * 1000) }),
    });
    if (!res.ok) throw new Error(`elevenlabs music ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  return toWav(dest);
}

/** One-shot sound design element (whoosh, impact, UI tick). */
export async function sfx(prompt, seconds = 2) {
  const dest = cachePath("sfx", `${prompt}|${seconds}`, "mp3");
  if (!existsSync(dest)) {
    const res = await fetch(`${API}/sound-generation`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.4 }),
    });
    if (!res.ok) throw new Error(`elevenlabs sfx ${res.status}: ${(await res.text()).slice(0, 300)}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  return toWav(dest);
}
