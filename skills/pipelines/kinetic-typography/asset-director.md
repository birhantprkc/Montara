# Asset Director - Kinetic Typography Pipeline

## Goal

Prepare the design and audio ingredients the typography needs before composition.

## Process

1. Resolve fonts to runtime-safe choices. Prefer Inter, Outfit, Montserrat,
   JetBrains Mono, Poppins, or other fonts known to render reliably.
2. Create or derive a compact visual style: background, text, accent, primary,
   and contrast notes.
3. Prepare audio timing inputs: transcript timestamps, music onsets, or a
   fallback beat grid.
4. Stage optional background media only when it helps; typography remains the
   primary read.
5. Generate `DESIGN.md` inputs for HyperFrames through the style bridge when
   `render_runtime="hyperframes"`.

## Output Requirements

- `asset_manifest` references every audio/media asset by stable id.
- Font choices and fallbacks are documented.
- If the runtime is HyperFrames, no asset path points at
  `remotion-composer/public/`.

## Review Focus

- Contrast is strong enough for the target platform.
- Audio and text timing source is real or explicitly estimated.
- Assets are local-first and reproducible.
