# Warfront Craft

Use this skill whenever a Montara run moves from "technically rendered" to "worth watching."
It is the taste layer shared by assistants, the CLI, and future GUI surfaces.

## Core Rules

1. **Voice is measurable.** Match pace, warmth, and onset density from references when available.
   Default narration should be clear, warm, and around 4.4 onsets per second.
2. **Music is scene-mapped.** Use cue ranges with `start`, `end`, `fadeIn`, `fadeOut`, and `gain`.
   Prefer intentional silence at major beats over a flat loop under everything.
3. **Master once.** Use one gentle sidechain and one loudness normalization pass. Target `-14 LUFS`,
   `-1 dBTP`, `48000 Hz`, and avoid stacked dynamics that pump.
4. **Move from frame one.** A cold open should not sit on static footage unless the stillness is a
   deliberate story beat.
5. **Keep maps and facts honest.** Visual confidence must match factual confidence.
6. **Text must survive phones.** Use readable text pills, strong shadow, safe zones, and short lines.
7. **QA playback, not just stills.** Check duration, frame decode, audio presence, clipping, and
   visible variety across the full file.
8. **Thumbnails need distinct hooks.** Generate three genuinely different thumbnail concepts; do not
   repeat the title as thumbnail text.
9. **Shorts cut on language.** Verify cut points by transcript or sentence boundary instead of
   guessing by duration.

## Where It Connects

- `hear/` measures voice, music, loudness, and speaker-similarity boundaries.
- `quality/` owns slideshow-risk, delivery promises, budget, and self-review.
- `render-ffmpeg` and post tools own local mastering and fallback rendering.
- Pipeline executive-producer skills decide when work is good enough to continue.
- Publish-stage skills package titles, thumbnails, captions, and platform variants.

## Review Prompt

Before calling a video done, ask:

- Does the first second move?
- Can the text be read on a phone?
- Does the audio hit the loudness target without pumping?
- Does the music change with the scene?
- Are claims, maps, and visuals honest?
- Did QA inspect actual playback frames?
- Are the thumbnail hooks distinct from each other and from the title?

