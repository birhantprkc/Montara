# Montara Demo Gallery

This gallery is the public proof set for Montara's local-first video system.
Every entry names the prompt, pipeline, tools, runtime, cost, and artifact to
inspect. The checked-in demo videos live under `demos/` and can be regenerated
with `pnpm demos:generate` or `node scripts/generate-github-demos.mjs`.

## Checked-In Public Demos

| Demo | Prompt / brief | Pipeline | Tools and runtime | Cost | Artifact |
| --- | --- | --- | --- | --- | --- |
| Full engine matrix | "Show every shipped Montara render/capture surface honestly in one founder-grade demo." | Remotion engine matrix -> FFmpeg mux/probe/poster | Remotion native local composition; FFmpeg mux/poster/probe; Windows system TTS when available | `$0` | `demos/01-engine-matrix.mp4` + `demos/previews/01-engine-matrix-preview.gif` + `demos/posters/01-engine-matrix-poster.jpg` |
| Documentary studio proof | "Show the documentary UI layer with map motion, source framing, and niche-ready positioning." | Remotion documentary-studio composition -> FFmpeg mux/probe/poster | Remotion, d3-geo, FFmpeg; Windows system TTS when available | `$0` | `demos/02-documentary-studio.mp4` + `demos/posters/02-documentary-studio-poster.jpg` |

The engine matrix covers FFmpeg, Remotion, HyperFrames, Blender, Three.js,
Manim, Revideo, Motion Canvas, and Playwright. It is deliberately honest:
FFmpeg and Remotion are demonstrated as local render/mux paths; runtime-gated
engines are shown with their adapter/probe status instead of being mislabelled as
native renders.

Demo metadata lives in `demos/manifest.json`.

## Validate-Generated Proofs

Run:

```bash
pnpm validate
```

Then inspect:

| Demo | Prompt / brief | Pipeline | Tools and runtime | Cost | Output |
| --- | --- | --- | --- | --- | --- |
| Timeline IR explainer | "Frame one moves; explain the Timeline IR contract." | ScenePlan -> Timeline IR | Remotion IR composer + FFmpeg fallback render | `$0` | `out/validate-compose-core.mp4` |
| Render auto handoff | "Render the Timeline IR and create pro-editor handoff files automatically." | Timeline IR -> MP4 + editor bridge | `montara render` -> MP4 + EDL/OTIO/FCPXML beside output | `$0` | `out/validate-render-cli.mp4` plus `.edl/.otio/.fcpxml` |
| Native Remotion smoke | "Render a spring/caption composition natively if the Remotion composer is installed." | native composition smoke | Remotion CLI; honest unavailable path when deps are absent | `$0` | `out/validate-remotion-native.mp4` |
| Native Remotion Timeline | "Render the same Timeline IR through the native Remotion composer when explicitly enabled." | Timeline IR composition | `REMOTION_ENABLED=1` -> Timeline props -> Remotion `Explainer` | `$0` | `out/validate-remotion-timeline-native.mp4` |
| Native HyperFrames smoke | "Render strict kinetic typography through HyperFrames when `npx hyperframes` resolves." | kinetic typography | Python `hyperframes_compose`, HyperFrames lint/validate/render | `$0` | `out/validate-hyperframes/validate-hyperframes-kinetic.mp4` |
| Character animation rig | "Render a local SVG/GSAP character rig through HyperFrames to a final MP4." | character-animation | `character_rig_renderer` -> `video_compose` -> HyperFrames lint/validate/render | `$0` | `out/validate-character-animation/final.mp4` |
| Python compose CLI | "Render direct edit decisions through the public CLI." | compose stage | `montara compose` -> Python `video_compose` -> FFmpeg | `$0` | `out/validate-cli-video-compose.mp4` |
| Documentary corpus montage | "Seed a local stock-footage corpus, retrieve by slot, and compose the selected clips." | documentary-montage | `montara corpus seed-fixture` -> Python `clip_search` -> `montara compose` | `$0` | `out/validate-documentary-montage.mp4` |
| 60s documentary open-stock proof | "Build a provenance-aware corpus proof, select one non-reused clip per documentary slot, and compose a 60s montage." | documentary-montage | `montara corpus seed-open-stock-proof` -> `clip_search.select_slots` -> `montara compose` | `$0` | `out/validate-documentary-open-stock-60s.mp4` plus selection/asset JSON |
| Screen-demo capture proof | "Pick up a completed screen recording artifact and compose it as a screen-demo video." | screen-demo | `montara capture pick-latest --recordings-dir` -> `montara compose` | `$0` | `out/validate-screen-demo.mp4` |
| Smart reel | "Create a vertical source-aware reel with hook/caption/end-card treatment." | reel | content-aware reel planner + FFmpeg reel renderer | `$0` | `out/validate-smart-reel.mp4` |
| Stage 3 moat smoke | "Use local brain if present, preflight a URL reference, and create a project workspace." | moat / CLI | `montara make --brain`, `montara analyze <url>`, `montara project init`, quality gates | `$0` | `out/stage-3-local-brain-smoke.mp4`, analysis JSON, `projects/stage3-workspace-smoke/project.json` |
| Provider live-readiness | "Show cloud provider live readiness without spending money or leaking keys." | provider audit | `montara providers live-audit` sanitized ledger | `$0`; BYOK opt-in for live smokes | `out/validate-provider-live-audit.json` |
| Editor handoff | "Export the same Timeline IR to a pro-editor format." | handoff | `montara export <timeline.json> --to otio|edl|fcpxml` | `$0` | generated on demand |
| Corpus discovery | "Show available stock/corpus sources without downloading media." | documentary preflight | `montara corpus sources` -> Python `corpus_builder.get_info()` | `$0` | stdout JSON/table |

## Regenerate Checked-In Public Demos

```bash
pnpm demos:generate
```

The generator does not make paid API calls. If system TTS is unavailable, it
keeps the video playable by muxing a silent AAC track.

## Prompt Coverage

Use [PROMPT_GALLERY.md](PROMPT_GALLERY.md) for broader prompt coverage:
talking-head overlays, documentary evidence cuts, kinetic typography, browser
demos behind login, editor handoff, style switches, and provider-aware prompts.
For public packaging, titles, launch videos, and community checklists, use
[docs/LAUNCH-PLAN.md](./LAUNCH-PLAN.md).
