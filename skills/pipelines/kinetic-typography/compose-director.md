# Compose Director - Kinetic Typography Pipeline

## Runtime Routing

Read `edit_decisions.render_runtime` before composing. It is a promise from the
planning stage, not a hint.

- `render_runtime="hyperframes"`: call `video_compose` or `hyperframes_compose`.
  `hyperframes_compose` must scaffold the workspace, run `hyperframes lint`, run
  `hyperframes validate`, then render. Lint and validate must pass before final
  delivery. Use `strict=true` unless explicitly iterating.
- `render_runtime="remotion"`: use the Remotion path only when the approved
  concept depends on existing React components or caption-burn parity.
- `render_runtime="ffmpeg"`: use only for deliberately simple assembly.

If HyperFrames is unavailable, surface the blocker and request approval before
switching. Record the new choice as a `render_runtime_selection` decision.

## HyperFrames Contract

Before render, read:

- `skills/core/hyperframes.md`
- `.agents/skills/hyperframes/SKILL.md`
- `.agents/skills/hyperframes-cli/SKILL.md`

Generated workspaces must have `DESIGN.md`, `index.html`, `hyperframes.json`,
workspace-local assets, registered paused timelines, and no infinite repeats.

## Verification

1. Confirm the MP4 exists and probes with duration and video stream.
2. Run final review and keep the report with the render artifacts.
3. Verify `render_runtime_used` matches the approved runtime.
4. Package the resulting MP4 with Timeline IR or editable HyperFrames workspace
   references for follow-up edits.
