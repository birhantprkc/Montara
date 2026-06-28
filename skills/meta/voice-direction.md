# Voice Direction

Montara does not narrate with one fixed voice. The **voice director** picks the best *available*
voice for each scene and shapes its delivery from the scene's **emotion**, **intensity**, and the
**energy of the music** under it — then sets a dynamic per-line volume and ducks the music so the
narration stays intelligible. It is pure logic with the system voice as the always-on floor, so a
plan is produced even with zero API keys.

## How it decides

```ts
import { directScene, directScript } from "@montara/quality";
const d = directScene({ emotion: "urgent", intensity: 0.8, musicEnergy: 0.6, text: "..." }, availableProviders);
// → { provider, rate, style, stability, gainDb, musicDuckDb, emotion, reason }
```

1. **Emotion** is taken from the scene, or inferred from keywords in the text
   (`neutral / calm / warm / tense / urgent / somber / triumphant / playful / authoritative`).
2. Each emotion has a delivery **preset** (rate, expressiveness, stability, base gain).
3. **Intensity** (0..1) bends the preset — faster/louder/less-stable as the beat peaks.
4. **Music energy** (0..1) raises the voice a touch and **ducks the bed** (down to −9 dB) so the
   words cut through.
5. **Provider** is chosen from what's actually available: expressive engines (ElevenLabs, OpenAI)
   win when the beat needs expression; otherwise the best available, with the OS system voice last
   as the guaranteed floor.

## CLI

```
montara voice direct urgent --intensity 0.8 --music 0.6
montara voice plan scenes.json     # [{ "emotion": "...", "intensity": 0.7, "musicEnergy": 0.4, "text": "..." }]
montara voice providers            # what voices are usable right now
```

## How it plugs into craft

This is craft rule 1 ("voice is measurable / pick by emotion + music"). For documentary work the
**baseline** voice is still the measured reference match (see `warfront-craft.md`); the director then
chooses *expression per scene* on top of that baseline. The `gainDb` and `musicDuckDb` it emits feed
the mix and the `-14 LUFS` master (`render-ffmpeg/master.ts`), so dynamic volumes survive mastering.
