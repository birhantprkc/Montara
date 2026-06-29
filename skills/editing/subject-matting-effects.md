# Subject Matting And Layered Effects

Use this when the edit needs text behind a person, foreground/background separation, name-from-
background effects, tracked callouts, or clean compositing around hair and motion.

## Plan The Matting Pipeline

Query the enhancement catalogue:

```ts
import { planMattingPipeline } from "@montara/providers";
```

The plan reports available tools, unavailable tools, and the fallback. Preferred chain:

1. Initial mask: SAM 2 video masks, Robust Video Matting, or rembg.
2. Edge refinement: BiRefNet or feathered alpha fallback.
3. Temporal stability: RVM or tracking for motion-aware consistency.
4. Composite through Timeline IR layers with explicit z-order.

## Degrade Honestly

If production matting is unavailable, do not fake a text-behind-subject effect. Use safe-zone
overlays, picture-in-picture, or manual masks. The rendered result must stay readable and should not
pretend segmentation happened.

## Timeline IR Contract

Represent effects as Timeline IR, not ad hoc filter strings:

- `mask`: rect, ellipse, rounded-rect, feather, invert.
- `effects`: blur, brightness, contrast, saturation, chromakey, sharpen.
- `z`: foreground/background order.
- `transform` and `keyframes`: tracked or animated placement.

The render adapter can compile this to ffmpeg, Remotion, HyperFrames, or a future matting runtime.
