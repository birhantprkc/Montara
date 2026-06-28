# Craft

The taste layer shared by **every** Montara video — Reels, ads, explainers, talking-heads, product
demos, documentaries, montages. It is what turns "technically rendered" into "worth watching." It
applies regardless of genre, language, or platform. Assistants, the CLI, the orchestrator, and the
GUIs all consult it before calling a video done.

Genre-specific rules live in their own skills and *extend* this one (e.g. documentary adds
"maps & facts honest" — see [warfront-craft.md](warfront-craft.md)). The rules below are universal.

## The universal rules

1. **Voice is measurable.** Match pace, warmth, and onset density to the piece's intent. When a
   reference exists, profile it and match. Pick the voice by **scene emotion + the music under it**,
   not a fixed default — see [voice-direction.md](voice-direction.md).
2. **Music is scene-mapped.** Cue ranges with `start`/`end`/`fadeIn`/`fadeOut`/`gain`. Prefer
   intentional silence at a beat over a flat loop under everything.
3. **Master once, to a target.** One measured two-pass loudness pass — `montara master <in>` →
   default **-14 LUFS, -1 dBTP, 48 kHz** (social/YouTube). Use -16 for podcasts, -23 for broadcast.
   Never stack dynamics that pump.
4. **Move from frame one.** A cold open shouldn't sit on a static frame unless the stillness is a
   deliberate beat. `montara qa` flags a file with no motion/cuts.
5. **Text must survive phones.** Readable pills, strong shadow, safe zones, short lines. Captions
   that merely echo the narration verbatim are amateurish — caption *meaning* (numbers, names,
   translations) or use them as accessibility subtitles, never both for the same content.
6. **Each scene earns its own composition.** Don't reuse one hero visual as scaffolding under every
   scene with only the caption changing — that's branded-slides, not film.
7. **QA playback, not stills.** `montara qa <video>` checks duration, streams, loudness/clipping,
   and visible variety across the whole file before you ship.
8. **Thumbnails need distinct hooks.** `montara thumbnail` makes three genuinely different concepts
   — different frame, different hook, different accent. Never just repeat the title.
9. **Shorts cut on language.** Verify cut points by sentence/transcript boundary, not by guessing a
   duration. `montara shorts <video>` produces vertical 9:16 cut-downs.

## Where it connects (real code, not aspiration)

| Rule | Backed by |
| --- | --- |
| voice selection by emotion+music | `quality/voice-director` + TTS selector + `hear` |
| master to -14 LUFS | `render-ffmpeg/master.ts` (`masterAudio`, `measureLoudness`) |
| QA playback | `hear/qaPlayback` |
| thumbnails / Shorts | `render-ffmpeg/craft.ts` |
| layered composition / text | `render-ffmpeg/composite.ts` + `skills/editing/` |
| scene distinctness / caption dedup | reviewer gates (`skills/meta/reviewer.md`) |

## Final review (ask before "done")

- Does the first second move?
- Is the text readable on a phone, and not just echoing narration?
- Does the master hit the loudness target without pumping?
- Does the music change with the scene, and does the voice match the scene's emotion?
- Does each scene have its own primary visual subject?
- Did QA inspect actual playback, not just a thumbnail?
- Are the three thumbnail hooks distinct from each other and from the title?
