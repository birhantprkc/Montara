# Music Intelligence

Use this when selecting, analyzing, generating, or mixing a music bed. Music is not a flat loop
under the whole video; it is a scene-mapped score with measured quality gates.

## Analyze First

Run the local analyzer before placing music:

```bash
montara music analyze <audio>
```

Read the JSON for duration, sample rate, loudness, peak, silence risk, rough dynamics, quality
gates, and suggestions. Treat missing deep DSP fields as an honest fallback, not permission to
guess. Richer backends can later fill centroid, MFCC, chroma, tempo, beat tracking, stereo width,
phase, and section boundaries using the same schema.

## Scene-Mapped Scoring

For every scene, decide the music intent:

- `support`: low gain, under narration, gentle fade.
- `lift`: slightly higher gain for a visual reveal.
- `drop`: intentional silence before a name, number, quote, punchline, or thesis.
- `resolve`: music returns after the payload lands.

Generate cues with:

```bash
montara music score <audio> <scenes.json>
```

Each cue must carry `[startSec,endSec,fadeInSec,fadeOutSec,gainDb,silenceBeforeSec]`. Crossfade
loops when you need extension. Never use a hard loop seam.

## Quality Gates

- Master once after VO, SFX, and music are mixed: `-14 LUFS / -1 dBTP`, `-ar 48000`.
- Use one gentle sidechain or ducking pass. Do not stack compressors until the bed pumps.
- Keep a lossless PCM intermediate for revisions.
- If the analyzer flags clipping, lower the bed before mastering.
- If it flags silence risk, verify the source file and gain before rendering.

## Method Sources

This skill follows Montara's local-first implementation while adopting the workflow ideas from
`audio-analyzer-rs` (structured spectral/harmonic/rhythm/loudness analysis) and
`claude-ai-music-skills` (quality gates, mastering targets, release discipline).
