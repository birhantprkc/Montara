# The Timeline IR

The Timeline IR is Montara's single source of truth — a renderer-neutral JSON document. Agents
*build* it, the schema *validates* it, and every renderer *compiles* it. Its machine-readable
schema lives at [`../../schemas/timeline.schema.json`](../../schemas/timeline.schema.json); scene
plans validate against [`../../schemas/scene-plan.schema.json`](../../schemas/scene-plan.schema.json).

## Two shapes

- **ScenePlan** — the simple authoring shape: `{ width, height, fps, scenes[] }`, where each scene is
  `{ id, title, durationSec, background }`. Good for quick authoring and the `plan` command.
- **Timeline** — the full IR: `{ version, composition, tracks[] }`. A `composition` carries
  `width/height/fps/durationSec/background`; each `track` has a `type` (`video` | `audio` | `text`)
  and `clips`. Clips share `id/type/startSec/durationSec` and add type-specific fields (a solid
  color source, text + style, or an audio source), plus optional `transform`, `keyframes` and
  `transitionIn/Out`.

## The core operations (`@montara/core`, pure, no I/O)

- `scenePlanToTimeline(plan)` — compile the simple shape into the full IR.
- `timelineToScenePlan(timeline)` — recover the simple shape (round-trips).
- `validateTimeline(timeline)` — returns a list of structural issues (`[]` means valid).
- `timelineDuration(timeline)` / `totalDuration(plan)` — read the runtime.

A renderer only ever consumes a **validated** Timeline. If `validateTimeline` returns issues, fix
the IR before rendering — the pre-compose gate enforces exactly this.
