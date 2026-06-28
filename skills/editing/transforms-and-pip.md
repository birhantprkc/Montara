# Transforms & Picture-in-Picture

## Transform

```ts
interface Transform {
  x: number;        // center X in composition px (default: comp center)
  y: number;        // center Y in composition px
  scale: number;    // box width as a fraction of comp width (1 = full width)
  rotateDeg: number;
  opacity: number;  // 0..1
}
```

`transform` is a `Partial<Transform>` on any clip. The compositor:

- sizes the box to `scale * comp.width` (height follows source aspect via `scale=W:-2`),
- places the box so its **center** is `(x, y)`,
- applies `rotateDeg` (with alpha), then `opacity`.

```ts
import { setTransform } from "@montara/core";
tl = setTransform(tl, "cam", { x: 1120, y: 600, scale: 0.28, opacity: 0.95 });
```

## Picture-in-Picture

PiP = a base layer at `scale: 1` plus an inset `MediaClip` at a small scale, parked in a corner,
optionally masked. Use the builder:

```ts
import { pictureInPicture } from "@montara/core";
const tl = pictureInPicture({
  width: 1920, height: 1080, fps: 30, durationSec: 12,
  base:  { path: "screen.mp4", kind: "video" },
  inset: { path: "webcam.mp4", kind: "video" },
  corner: "br",            // tl | tr | bl | br
  insetScale: 0.3,         // 30% of width
  marginPct: 0.04,         // gap from the edge
  insetMask: { shape: "ellipse", feather: 0.06 }, // circular webcam; omit for a hard rectangle
});
```

CLI:

```
montara fx pip screen.mp4 webcam.mp4 out.mp4 --corner br --scale 0.3 --ellipse
```

The inset is placed on its own `video-pip` track at `z: 10`, so it always sits above the base.
For multiple insets, add more `MediaClip`s with different `transform.x/y` and `z`.

## Forcing an exact box

When you need a non-aspect box (e.g. a square cam, or a collage cell), set `box`:

```ts
clip.box = { wFrac: 0.25, hFrac: 0.25 }; // exact 25% x 25% box, cover-cropped
```

`box` overrides `scale` for sizing and cover-crops the source to fill it.
