# Script Director - Kinetic Typography Pipeline

## Goal

Turn the idea into short, animatable line groups. The script should create rhythm
and contrast without forcing the renderer to squeeze paragraphs on screen.

## Process

1. Split the message into line groups of 2-7 words.
2. Mark emphasis words, silence beats, and any slam/cut moments.
3. Keep one primary thought per screen.
4. Preserve spoken meaning if the source is a transcript; do not rewrite quotes
   into misleading hooks.
5. Add timing hints when the line must hit a beat or onset.

## Output Requirements

- `script.lines[]` or equivalent groups include text, intended duration, and
  emphasis words.
- No display line relies on `<br>` hacks; wrapping must remain natural.
- The script leaves room for visual holds after dense phrases.

## Review Focus

- Every word earns its space.
- The hook is fast but readable.
- The ending phrase lands cleanly and can support a thumbnail.
