# Montara Capability Snapshot

Snapshot date: 2026-06-30.

## What Works Now

- **Python engine bridge:** ready. Current bridge reports 116 tools, 18 lib modules, and 14 pipeline manifests.
- **Timeline IR:** TypeScript core validates, edits, renders, and exports Timeline IR.
- **CLI:** `doctor`, `make`, `plan`, `render`, `review`, `analyze`, `capture`, `compose`,
  `corpus`, `reel`, `music`, `voiceid`, provider listing, engine bridge commands,
  and 3D render commands.
- **FFmpeg render:** fully working native renderer and fallback path for MP4, probe, frame
  extraction, audio mix/enhance, subtitles, reels, and simple composites.
- **Editor export:** EDL, OTIO, and FCPXML verified through the bridge package.
- **Blender:** real headless adapter exists when Blender is installed.
- **Three.js / Manim:** adapters exist and report availability honestly; native output is runtime-gated.
- **Playwright browser capture:** `playwright_recorder` is discoverable, pytest-covered, exposed
  through `montara capture`, supports interactive login storageState, records browser video,
  and transcodes to MP4 through FFmpeg.
- **Voice similarity:** `voice_id.py` and `@montara/hear` expose optional Resemblyzer/SpeechBrain/
  pyannote status without hard-failing.
- **Documentary evidence craft:** generalized Montara skill at
  `skills/meta/documentary-evidence-craft.md`; `warfront-craft.md` is a compatibility alias.
- **Layer 3 skills:** 69 installed `.agents/skills` packs covering GSAP, HyperFrames, Three.js,
  Manim, FFmpeg, video understanding, music, speech, Playwright, visual style, and character animation.

## Latest Gates

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run verify` | 293 passed, 0 failed |
| `npm.cmd run validate` | 82 passed, 0 failed |
| `python -m pytest tests` | 375 passed, 9 skipped |

## Example Outputs

| Output | Path | Renderer |
| --- | --- | --- |
| Core validate render | `out/validate-compose-core.mp4` | FFmpeg fallback from Timeline IR |
| Core validate IR | `out/validate-compose-core.timeline.json` | Timeline IR |
| Python video compose CLI smoke | `out/validate-cli-video-compose.mp4` | `montara compose` -> Python `video_compose` |
| Native Remotion smoke | `out/validate-remotion-native.mp4` | Remotion native spring/caption composition when composer deps are installed |
| Native HyperFrames smoke | `out/validate-hyperframes/validate-hyperframes-kinetic.mp4` | HyperFrames strict lint/validate/render kinetic typography when `npx hyperframes` is available |
| Headless validate render | `out/validate-headless.mp4` | FFmpeg path |
| Smart reel validate render | `out/validate-smart-reel.mp4` | FFmpeg reel path |

Generated outputs live under `out/` and are not committed.
The README demo gallery and [docs/DEMOS.md](./DEMOS.md) now map these artifacts
and checked-in `assets/` proofs to commands, pipelines, runtimes, and cost
expectations.

## Tech Pack Status

| Tech | Current status |
| --- | --- |
| Remotion | Native smoke render validate-gated when `remotion-composer` deps are installed; full Timeline default routing pending. |
| Revideo | Registered runtime-gated MIT fallback target; native package work pending. |
| Motion Canvas | Registered runtime-gated kinetic typography target; native package work pending. |
| HyperFrames | Python `hyperframes_compose` strict kinetic smoke is validate-gated; kinetic typography now has a first-class pipeline; broader non-kinetic pipeline/runtime parity pending. |
| Three.js | Adapter package exists; native headless proof depends on browser/runtime. |
| Blender | Real adapter and native proof path when installed. |
| Manim | Adapter package exists; native binary optional. |
| Spline | Planned registry entry only. |
| FFmpeg | Fully working native renderer and fallback. |
| Playwright | Browser capture with `montara capture`, login/storageState workflow; runtime-gated on Node Playwright install. |

## Provider Executor Status

The TypeScript provider registry now includes an injectable BYOK executor and
redaction helper. `verify` and `validate` replay sanitized fixtures for BFL-style
async submit/poll/download without live keys or network calls. First-wave request
shape coverage includes OpenAI Images (`gpt-image-2`), BFL FLUX.2, Google Gemini
image, Google Veo 3.1, and Runway versioned task requests. The Python image
provider tools now also expose testable OpenAI/BFL request builders; `flux_image`
prefers direct BFL and keeps fal.ai as a compatibility fallback.

`montara providers audit` now writes a redacted fixture report covering every
cloud video/image/TTS/music provider in the registry, and `montara providers
smoke <provider-id>` builds a dry-run request by default. A real network smoke is
blocked unless the caller passes `--live`, provides the provider key, and sets
`MONTARA_LIVE_PROVIDER_SMOKE=1`.

This is not yet a blanket production claim for every cloud provider. Python
provider tools and the cloud long tail still need real-key smoke confirmations;
see [docs/PROVIDER-AUDIT.md](./PROVIDER-AUDIT.md).

## Voice And Audio Options

Best current path:

1. Use `hear` for LUFS, onset/pacing, loudness, spectral, and music QA.
2. Use scene-mapped music cues: fades, gain, intentional silence, no hard loops.
3. Use `voice_id.py` for consented speaker-similarity when optional dependencies are installed.
4. Keep celebrity/corpus matching as labelled-reference matching; do not imply rights to use a voice.
5. Use `skills/creative/music-intelligence.md`,
   `skills/creative/speaker-voice-intelligence.md`, and
   `skills/meta/documentary-evidence-craft.md` for agent guidance.

## Next Best Engineering Steps

1. Add native render validation skill guidance.
2. Add provider-audit skill guidance for live BYOK docs checks.
3. Finish Remotion default routing for Timeline scenes.
4. Add documentary stock-footage validate case using the new corpus CLI surface.
