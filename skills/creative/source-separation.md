# Source Separation (Demucs)

Demucs is a neural **source separation** model. Give it a mixed audio file and it returns separate
**stems** — vocals, drums, bass, other — or a simpler vocals vs accompaniment split.

Reach for it when the voice and the music are **already baked into the same file**. It is the audio
counterpart to `montara matte`: matte separates a picture into subject and background, Demucs
separates a mix into tracks.

## Demucs vs multiband enhance — pick the right tool

|  | **Multiband enhance** (`montara enhance`) | **Source separation** (`montara hear stems`) |
| --- | --- | --- |
| Input | One dirty voice take | A full mix (VO + music + room) |
| Splits by | **Frequency bands** — clean each band's noise | **Content** — into separate tracks |
| Output | Still **one** cleaned waveform | **Multiple** files you can mute, duck, or rebalance |
| Needs | FFmpeg only | Python + model weights (RAM/VRAM gated, like RVM) |
| Cost | Instant, always available | Minutes on CPU; weights download on first run |

**Multiband polishes one take. Demucs unmixes a mix.** If the ask is "make this VO less hissy,"
use `enhance` — it is faster and needs no download. If the ask is "get the voice out of the music,"
only separation can do it.

## When to use it

- Pull a **voice out of a bed** when music or noise is baked into the same file.
- Clean or replace **only** the vocal stem while keeping the music.
- Documentary, podcast, and reel workflows where you never got separate tracks.
- Re-balance a mix you did not author: duck the drums, lift the voice, swap the bed.

## Usage

```bash
montara hear stems mix.wav out/stems                      # vocals, drums, bass, other
montara hear stems interview.mp4 out/stems --two-stems vocals   # vocals + no_vocals
montara hear stems mix.wav out/stems --model htdemucs_ft   # slower, higher quality
```

```ts
import { separateStems, separateStemsAvailable } from "@montara/hear";

if (separateStemsAvailable()) {
  const r = separateStems("mix.wav", "out/stems", { twoStems: "vocals" });
  // r.stems = { vocals: "…/vocals.wav", no_vocals: "…/no_vocals.wav" }
}
```

Video inputs work directly — the audio track is read from the container.

## Verified behaviour

Separating Montara's own demo mix (narration over a music bed) with `--two-stems vocals` and then
transcribing each stem:

- `vocals.wav` → *"No green screen, no rotoscoping. Montara mattes the subject, stands him on a real
  street, and lifts the title out of the road behind him."* (25 words)
- `no_vocals.wav` → **silence** (0 words)

The voice is genuinely lifted out of the bed, not merely EQ'd.

## Honest limits

- **Runtime-gated.** `separateStemsAvailable()` is false without `pip install demucs`; every caller
  must degrade rather than fail. `montara enhance` remains the always-available floor.
- **Slow on CPU.** Minutes for long files; the first run downloads model weights.
- **Not magic.** Heavy clipping, extreme compression, or a voice buried far under the bed will leave
  artefacts in both stems. Check the result with `montara hear <stem>` before building on it.
- **Licensing.** Demucs weights carry their own model-card terms; Montara never vendors them.
