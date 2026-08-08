# Voice Restoration And Enhancement

A laptop-mic recording is not unusable, it is unfinished. This is the pass that makes it sound
produced: gate the room, notch the hum, denoise, tame sibilance, shape tone, then one gentle
compressor.

```bash
montara enhance narration.wav out/narration-clean.wav
montara enhance narration.wav out/narration-clean.wav --denoise strong --dehum 50 --gate -45
montara enhance narration.wav out/narration-clean.wav --master   # then land it at -14 LUFS
```

## Order is the craft

The chain is fixed for a reason, and it is not alphabetical:

1. **highpass 80 Hz** — desk rumble and plosive energy, gone before anything reacts to it.
2. **dehum** — notch the mains frequency and its first two harmonics. `--dehum 50` in the EU and
   Asia, `--dehum 60` in the Americas. Wrong number = no effect.
3. **gate** — silence the room between phrases so the denoiser and compressor have nothing to chew.
4. **denoise** — `afftdn`, or `arnndn` when you pass `--rnnoise model.rnnn`. RNNoise is markedly
   better on speech recorded in a live room, and it *replaces* the FFT denoiser rather than
   stacking with it.
5. **de-esser** — sibilance, before you lift presence and make it worse.
6. **EQ** — cut 300 Hz boxiness, add 180 Hz body, lift 3.2 kHz for intelligibility.
7. **one compressor** — reacting to the finished tone, not to noise.
8. **limiter** — a ceiling, not a sound.

Clean before you shape; shape before you compress. Reordering this is how narration ends up
sounding like it was recorded in a tube.

## Never master twice

`enhance` deliberately contains no `loudnorm`. Montara masters **once**, at the end, after
narration and music are mixed — `--master`, or `masterAudio` directly. Stacking a second loudness
stage on top of the compressor is exactly what makes narration pump. One gentle sidechain, one
`loudnorm`, `-14 LUFS / -1 dBTP`, `-ar 48000`.

## Denoise strength

| Level | `afftdn` nr | Use on |
|---|---|---|
| `light` | 6 | A good room with faint air conditioning |
| `medium` | 12 | Default. Normal room tone |
| `strong` | 20 | Traffic, fans, a live venue |

Strong denoise is audible on anything musical. It is for speech. If the voice starts sounding
underwater or the S's turn into chirps, step down a level — noise is more forgivable than
artefacts.

## Filters that are not in every build

`deesser` and `arnndn` are missing from some distro ffmpeg builds. Montara probes the build and
drops what it lacks, reporting the skipped links rather than failing the render. If the chain
prints without a de-esser, that is your build, not your file.

## Measure, don't guess

```bash
montara hear narration.wav
```

Voice is measurable, and that is how Montara picks narrators — profile a reference, match the
candidate acoustically, don't choose by vibe.

| Number | Meaning | Target for narration |
|---|---|---|
| `onsetsPerSec` | Pace, from short-gap detection | roughly 4–5; under 3 drags, over 6 rushes |
| `warmth` | 290 Hz vs 5 kHz energy, 0..1 | ~0.5 is neutral; higher is chestier |
| `speechRatio` | How much of the take is speech | under 0.5 means trim before comparing |

```ts
import { matchVoice, measureVoiceQuality } from "@montara/hear";

const reference = measureVoiceQuality("reference-narrator.wav");
const candidate = measureVoiceQuality("take-3.wav");
matchVoice(reference, candidate); // { score, paceDelta, warmthDelta, verdict }
```

Both numbers are approximations of their studio equivalents and say so in their `notes`. They are
for comparing takes against each other, not for certifying a master.
