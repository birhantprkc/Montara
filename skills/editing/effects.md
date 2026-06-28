# Effects

Effects are an **ordered chain** on a clip, applied before it is composited. Each is a small,
real ffmpeg filter — no placeholders.

```ts
interface Effect {
  type: "blur" | "brightness" | "contrast" | "saturation" | "grayscale" | "sharpen" | "chromakey";
  amount?: number;     // effect-normalized (see table)
  color?: string;      // chromakey key colour, hex without '#'
  similarity?: number; // chromakey 0..1
}
```

| type | maps to ffmpeg | neutral | typical |
| --- | --- | --- | --- |
| `blur` | `boxblur` | 0 | `amount: 0.3` |
| `brightness` | `eq=brightness` | `0` | `-0.3 .. 0.3` |
| `contrast` | `eq=contrast` | `1` | `0.8 .. 1.4` |
| `saturation` | `eq=saturation` | `1` | `0 .. 2` (`0` = B&W) |
| `grayscale` | `hue=s=0` | — | toggle |
| `sharpen` | `unsharp` | 0 | `amount: 1` |
| `chromakey` | `chromakey=0xCOLOR:similarity:0.1` | — | green-screen cutout |

```ts
import { addEffect, setEffects } from "@montara/core";

tl = addEffect(tl, "broll", { type: "saturation", amount: 1.25 });
tl = addEffect(tl, "broll", { type: "contrast", amount: 1.1 });   // order matters

// green-screen subject over a new background (put the keyed clip on a higher track)
tl = addEffect(tl, "subject", { type: "chromakey", color: "00ff00", similarity: 0.2 });

// replace the whole chain
tl = setEffects(tl, "flashback", [{ type: "grayscale" }, { type: "brightness", amount: -0.1 }]);
```

## Order & interaction

- Effects run **top-to-bottom** in the array, then rotation, then the mask/opacity alpha pass.
- `chromakey` produces alpha; if you *also* set a `mask`, the mask's alpha wins (mask runs after).
  Use one or the other for the same cutout.
- Keep chains short on long clips — `blur`/`chromakey` are per-pixel and add render time.
