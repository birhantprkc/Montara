# Masks

A mask makes part of a layer transparent. It is evaluated in the **clip box's own normalized
0..1 space**, so it scales with the clip.

```ts
interface Mask {
  shape: "rect" | "ellipse" | "rounded-rect" | "polygon";
  x?: number; y?: number; w?: number; h?: number; // mask rect within the box (default full box)
  radius?: number;   // rounded-rect corner radius (normalized)
  feather?: number;  // 0 = hard edge, ~0.06 = soft
  invert?: boolean;  // keep the OUTSIDE instead
  points?: { x: number; y: number }[]; // polygon only, >= 3, normalized to the box
}
```

The compositor compiles the mask to an ffmpeg `geq` alpha expression, folded with the clip's
opacity, so a masked layer is also dimmable.

## Common masks

```ts
import { setMask } from "@montara/core";

// circular webcam / avatar
tl = setMask(tl, "cam", { shape: "ellipse", feather: 0.06 });

// rounded-rectangle card
tl = setMask(tl, "card", { shape: "rounded-rect", radius: 0.12, feather: 0.02 });

// reveal only the left half (spotlight), soft edge
tl = setMask(tl, "hero", { shape: "rect", x: 0, y: 0, w: 0.5, h: 1, feather: 0.08 });

// vignette-style "keep the edges" by inverting an ellipse
tl = setMask(tl, "bg", { shape: "ellipse", feather: 0.3, invert: true });

// hand-cut a shape the primitives can't describe — a window, a sign, a doorway
tl = setMask(tl, "wall", {
  shape: "polygon",
  points: [{ x: 0.12, y: 0.08 }, { x: 0.88, y: 0.14 }, { x: 0.84, y: 0.92 }, { x: 0.16, y: 0.86 }],
  feather: 0.02,
});

// remove the mask
tl = setMask(tl, "cam", null);
```

## External alpha mattes

A mask is geometry you can write down. When the shape is a *person* — moving, with hair — you want
a per-frame alpha channel instead. That is a `matte`: a separate grayscale video whose luma drives
the clip's transparency.

```ts
interface Matte {
  path: string;                  // grayscale MP4: white keeps, black cuts
  kind?: "luma" | "alpha";
  invert?: boolean;
  featherPx?: number;            // soften the edge, in source pixels
  chokePx?: number;              // pull the edge inward to kill a light fringe
  opacity?: number;              // 0..1, folded into the matte
}
```

```ts
import { setMatte } from "@montara/core";

tl = setMatte(tl, "speaker", { path: "out/vision/matte.mp4", kind: "luma", featherPx: 2 });
tl = setMatte(tl, "speaker", null); // detach
```

Generate one with `montara matte <video>` — see
[../creative/subject-matting-effects.md](../creative/subject-matting-effects.md). Pass
`--apply-to <ir.json> --clip <id>` and the command wires the matte into the IR for you.

A mask and a matte compose: the matte cuts the subject out, the mask then trims the region you
actually want on screen. The compositor multiplies both into one alpha channel.

## Notes

- `feather` is clamped to a small minimum so a "hard" edge is still antialiased.
- For a green-screen cutout (keying by colour, not shape) use a `chromakey` **effect** instead —
  see [effects.md](effects.md). Mask = geometry; chromakey = colour.
- Masks are per-clip; to mask a whole group, mask each layer or pre-composite the group to a file
  and mask the resulting clip.
