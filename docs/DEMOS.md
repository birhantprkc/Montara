# Montara Demo Gallery

This gallery is the public proof set for Montara's local-first video system.
Every entry names the prompt, pipeline, tools, runtime, cost, and artifact to
inspect. The checked-in assets are Montara-owned generated media and can be
regenerated with `scripts/render-demo-assets.ts`.

## Checked-In Assets

| Demo | Prompt / brief | Pipeline | Tools and runtime | Cost | Artifact |
| --- | --- | --- | --- | --- | --- |
| Montara showcase | "Explain Montara's one Timeline IR and local fallback story in a compact capability reel." | animated-explainer | `renderScenePlan` -> FFmpeg native MP4 | `$0` | `assets/montara-showcase.mp4` |
| Showcase poster | "Create a poster frame for the Montara showcase clip." | publish asset | FFmpeg frame extraction | `$0` | `assets/showcase.jpg` |
| Three.js engine proof | "Reserve a 3D engine slot and render a proof even when native WebGL capture is unavailable." | animation / 3D | render-engine selector; current artifact uses `degraded-ffmpeg` fallback | `$0` | `assets/montara-threejs-proof.mp4` |
| Manim engine proof | "Reserve a math-animation slot and render a proof even when Manim is not installed." | animation / math | render-engine selector; current artifact uses `degraded-ffmpeg` fallback | `$0` | `assets/montara-manim-proof.mp4` |
| Blender engine proof | "Render a Montara 3D title when Blender is installed." | 3D title | Blender external adapter; current artifact records native/fallback status in manifest | `$0` | `assets/montara-blender-proof.mp4` |
| Social preview | "Make a share card that says Timeline IR, Python engine, any assistant." | publish asset | local FFmpeg still-card generation | `$0` | `assets/social_preview.png` |

Asset metadata lives in `assets/montara-assets.json`.

## Validate-Generated Proofs

Run:

```bash
npm.cmd run validate
```

Then inspect:

| Demo | Prompt / brief | Pipeline | Tools and runtime | Cost | Output |
| --- | --- | --- | --- | --- | --- |
| Timeline IR explainer | "Frame one moves; explain the Timeline IR contract." | ScenePlan -> Timeline IR | Remotion IR composer + FFmpeg fallback render | `$0` | `out/validate-compose-core.mp4` |
| Native Remotion smoke | "Render a spring/caption composition natively if the Remotion composer is installed." | native composition smoke | Remotion CLI; honest unavailable path when deps are absent | `$0` | `out/validate-remotion-native.mp4` |
| Native Remotion Timeline | "Render the same Timeline IR through the native Remotion composer when explicitly enabled." | Timeline IR composition | `REMOTION_ENABLED=1` -> Timeline props -> Remotion `Explainer` | `$0` | `out/validate-remotion-timeline-native.mp4` |
| Native HyperFrames smoke | "Render strict kinetic typography through HyperFrames when `npx hyperframes` resolves." | kinetic typography | Python `hyperframes_compose`, HyperFrames lint/validate/render | `$0` | `out/validate-hyperframes/validate-hyperframes-kinetic.mp4` |
| Python compose CLI | "Render direct edit decisions through the public CLI." | compose stage | `montara compose` -> Python `video_compose` -> FFmpeg | `$0` | `out/validate-cli-video-compose.mp4` |
| Documentary corpus montage | "Seed a local stock-footage corpus, retrieve by slot, and compose the selected clips." | documentary-montage | `montara corpus seed-fixture` -> Python `clip_search` -> `montara compose` | `$0` | `out/validate-documentary-montage.mp4` |
| 60s documentary open-stock proof | "Build a provenance-aware corpus proof, select one non-reused clip per documentary slot, and compose a 60s montage." | documentary-montage | `montara corpus seed-open-stock-proof` -> `clip_search.select_slots` -> `montara compose` | `$0` | `out/validate-documentary-open-stock-60s.mp4` plus selection/asset JSON |
| Screen-demo capture proof | "Pick up a completed screen recording artifact and compose it as a screen-demo video." | screen-demo | `montara capture pick-latest --recordings-dir` -> `montara compose` | `$0` | `out/validate-screen-demo.mp4` |
| Smart reel | "Create a vertical source-aware reel with hook/caption/end-card treatment." | reel | content-aware reel planner + FFmpeg reel renderer | `$0` | `out/validate-smart-reel.mp4` |
| Editor handoff | "Export the same Timeline IR to a pro-editor format." | handoff | `montara export <timeline.json> --to otio|edl|fcpxml` | `$0` | generated on demand |
| Corpus discovery | "Show available stock/corpus sources without downloading media." | documentary preflight | `montara corpus sources` -> Python `corpus_builder.get_info()` | `$0` | stdout JSON/table |

## Regenerate Checked-In Demo Assets

```powershell
node .\node_modules\esbuild\bin\esbuild scripts\render-demo-assets.ts --bundle --platform=node --format=esm --outfile=scripts\.render-demo-assets.mjs
node scripts\.render-demo-assets.mjs
```

If a native runtime is missing, the generator records the fallback renderer in
`assets/montara-assets.json` instead of pretending native output was produced.

## Prompt Coverage

Use [PROMPT_GALLERY.md](../PROMPT_GALLERY.md) for broader prompt coverage:
talking-head overlays, documentary evidence cuts, kinetic typography, browser
demos behind login, editor handoff, style switches, and provider-aware prompts.
For public packaging, titles, launch videos, and community checklists, use
[docs/LAUNCH-PLAN.md](./LAUNCH-PLAN.md).
