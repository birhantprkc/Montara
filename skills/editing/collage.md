# Collage / Split-screen

A collage is N media clips, each cover-cropped into an **exact cell box**, arranged in a grid.
Because each tile is just a `MediaClip` with a `box` and a `transform` center, you can also build
irregular split-screens by hand.

## Builder

```ts
import { collage } from "@montara/core";
const tl = collage({
  width: 1920, height: 1080, fps: 30, durationSec: 8,
  cells: [
    { path: "a.mp4" }, { path: "b.mp4" },
    { path: "c.mp4" }, { path: "d.mp4" },
  ],
  cols: 2, rows: 2,   // omit to auto-square
  gapPct: 0.01,       // gutter as a fraction of width
  background: "0a0a0a",
});
```

CLI:

```
montara fx collage out.mp4 a.mp4 b.mp4 c.mp4 d.mp4 --cols 2
```

## How a tile is built

Each cell becomes a `MediaClip` with:

- `box = { wFrac: cellW/compW, hFrac: cellH/compH }` — forces the exact cell size, cover-cropped
  so the source fills the cell regardless of its aspect.
- `transform.x/y` — the cell's center, accounting for the gutter.
- `fit: "cover"`.

## Hand-built split-screen (50/50)

```ts
import { mediaClip } from "@montara/core";
const c = { width: 1920, height: 1080, fps: 30, durationSec: 8, background: "000000" };
const left  = mediaClip("left",  { path: "l.mp4" }, c, { x: 480,  y: 540 });
left.box  = { wFrac: 0.5, hFrac: 1 };
const right = mediaClip("right", { path: "r.mp4" }, c, { x: 1440, y: 540 });
right.box = { wFrac: 0.5, hFrac: 1 };
```

## Tips

- More cells than grid slots are dropped — size `cols`/`rows` to fit.
- Add a `mask: { shape: "rounded-rect", radius: 0.06 }` per tile for a soft-card look.
- Put a captions/text track above the collage track for labels per quadrant.
