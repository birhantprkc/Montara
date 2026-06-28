# Masks

A mask makes part of a layer transparent. It is evaluated in the **clip box's own normalized
0..1 space**, so it scales with the clip.

```ts
interface Mask {
  shape: "rect" | "ellipse" | "rounded-rect";
  x?: number; y?: number; w?: number; h?: number; // mask rect within the box (default full box)
  radius?: number;   // rounded-rect corner radius (normalized)
  feather?: number;  // 0 = hard edge, ~0.06 = soft
  invert?: boolean;  // keep the OUTSIDE instead
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

// remove the mask
tl = setMask(tl, "cam", null);
```

## Notes

- `feather` is clamped to a small minimum so a "hard" edge is still antialiased.
- For a green-screen cutout (keying by colour, not shape) use a `chromakey` **effect** instead —
  see [effects.md](effects.md). Mask = geometry; chromakey = colour.
- Masks are per-clip; to mask a whole group, mask each layer or pre-composite the group to a file
  and mask the resulting clip.
