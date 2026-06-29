# Edit Director - Kinetic Typography Pipeline

## Goal

Turn the scene plan into editable `edit_decisions` and Timeline IR handoff data.

## Process

1. Preserve the approved `render_runtime`; do not change it silently.
2. Use `type: "kinetic_typography"` cuts for text-led beats when HyperFrames is
   selected.
3. Keep cut timings aligned with transcript, onset, or beat-grid evidence.
4. Emit Timeline IR where possible so users can still edit the structure after
   render.
5. Log any fallback or runtime concern in `decision_log`.

## Output Requirements

- `edit_decisions.render_runtime` exists and matches the approved choice.
- Kinetic cuts carry `text`, optional `subtitle`, `in_seconds`, and
  `out_seconds`.
- The Timeline IR validates or the render report explains when a runtime-native
  workspace is the editable source for that stage.

## Review Focus

- The edit is rhythm-first, not a stack of generic title cards.
- Safe-zone and duration decisions are visible.
- Runtime swaps are impossible to miss.
