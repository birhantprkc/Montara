# Idea Director - Kinetic Typography Pipeline

## When To Use

Use this pipeline for text-first motion: punchy quote videos, lyric or transcript
rhythm pieces, product launch phrases, and brand manifesto edits. The brief should
work even if every visual is typography, shape, color, and timing.

## Runtime Selection Contract

You must choose `render_runtime` explicitly and record a `render_runtime_selection`
decision. Present both Remotion and HyperFrames when both are available:

- `render_runtime="hyperframes"` fits HTML/CSS/GSAP-native kinetic typography,
  word stagger, product title cards, and registry-block motion.
- `render_runtime="remotion"` fits existing React scene stacks, chart/stat cards,
  word-level caption burn parity, or compositions already built in Remotion.
- `render_runtime="ffmpeg"` fits simple assembly when the user does not need
  designed text motion.

Do not silently default. If HyperFrames is unavailable, say what is missing and
ask whether to install it, switch runtime, or proceed with a simpler fallback.

## Process

1. Identify the source of timing: transcript, song/music onsets, voiceover, or
   user-supplied phrase list.
2. Pick output shape: vertical short, square, landscape, or multiple variants.
3. Define the text promise: what phrase, concept, or emotional turn the viewer
   should remember.
4. Decide visual language: high-contrast palette, font family, motion energy,
   transition family, and density limits.
5. Build the brief with `render_runtime`, target duration, target platform,
   typography density, and blocked capabilities.

## Quality Gate

- The brief is text-led, not generic explainer-card-led.
- `render_runtime` is approved or a runtime blocker is explicit.
- The decision log explains why HyperFrames, Remotion, or FFmpeg was selected.
