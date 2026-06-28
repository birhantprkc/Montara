# Layers & Tracks

Montara composites **bottom-to-top**. Painting order:

1. `composition.background` fills the frame.
2. Every **video-track** clip is overlaid, sorted by effective z (see below).
3. **text**-track clips are burned on top (drawtext).
4. **audio**-track clips are mixed (file sources) or silence is generated.

## Effective z-order

For each video clip the compositor computes a z value:

- If the clip sets `z`, that wins (higher = on top).
- Otherwise z falls back to `trackIndex * 100 + clipIndex` — i.e. later tracks sit above earlier
  tracks, and later clips within a track sit above earlier ones.

```ts
import { setZ } from "@montara/core";
let tl = setZ(tl, "logo", 1000);   // force the logo above everything
tl = setZ(tl, "lower-third", 500);
```

## Tracks

A `Track` is `{ id, type: "video"|"audio"|"text", clips: Clip[] }`. Use separate tracks to keep
roles tidy (a base track, a PiP track, a captions track, a music track). Clip `type` must match
its track `type` — `validateTimeline` flags mismatches.

## Clip kinds on the video track

| Kind | Shape | Use |
| --- | --- | --- |
| `SolidClip` | `source: { kind: "solid", color }` | backgrounds, colour cards |
| `MediaClip` | `source: { kind: "image"\|"video", path }` | real footage, the unit of PiP/collage |

`MediaClip` adds `fit` (`cover`/`contain`/`fill`), `sourceInSec` (trim into a video), and the shared
layer fields `transform` / `box` / `crop` / `mask` / `effects`.

## Time vs. layers

`startSec`/`durationSec` place a clip in **time**; overlays are gated with
`enable='between(t,start,end)'`, so a clip only shows during its window. Position in **space** is
`transform`. The two are independent — a PiP can pop in at 3s and animate later via keyframes.
