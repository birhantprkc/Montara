# Montara Capability Snapshot

Snapshot date: 2026-07-02.

## What Works Now

- **Python engine bridge:** ready. Current bridge reports 116 tools, 18 lib modules, and 14 pipeline manifests.
- **Timeline IR:** TypeScript core validates, edits, renders, and exports Timeline IR.
- **CLI:** `doctor`, `status`, `runtimes`, `project init`, `make --brain`, `plan`, `render`, `review`, `analyze`, `understand`, `capture`, `compose`,
  `corpus`, `reel`, `music`, `voiceid`, provider listing/audit/live-audit, engine bridge commands,
  Stage 1 parity audit, license-aware render recommendations, and 3D render commands.
- **FFmpeg render:** fully working native renderer and fallback path for MP4, probe, frame
  extraction, audio mix/enhance, subtitles, reels, and simple composites.
- **Editor export:** EDL, OTIO, and FCPXML verified through the bridge package and
  auto-written beside `montara render` MP4 outputs by default.
- **Blender:** real headless adapter exists when Blender is installed.
- **Three.js / Manim:** adapters exist and report availability honestly; native output is runtime-gated.
- **Playwright browser capture:** `playwright_recorder` is discoverable, pytest-covered, exposed
  through `montara capture`, supports interactive login storageState, records browser video,
  and transcodes to MP4 through FFmpeg.
- **Documentary corpus proof:** `montara corpus seed-fixture` covers the small
  offline fixture path, and `montara corpus seed-open-stock-proof` now creates a
  12-slot, 60-second provenance-aware corpus proof. `clip_search.select_slots`
  selects non-reused rows, writes selection/asset artifacts, and `montara compose`
  renders the MP4. Live publication footage still runs through `corpus_builder`
  against open sources such as Archive.org, Wikimedia, NASA, NOAA, NARA, and LOC.
- **Screen-demo capture proof:** `montara capture pick-latest --recordings-dir`
  materializes a completed local recording artifact, then `montara compose` renders it
  through the screen-demo edit-decision path to MP4.
- **Source understanding:** `montara understand` writes model-aware source JSON. The
  default path stays FFmpeg/signalstats; optional Transformers.js CLIP frame
  classification runs only when the package and model opt-in are present.
- **Voice similarity:** `tools/audio/voice_id.py` and `@montara/hear` expose optional Resemblyzer/SpeechBrain/
  pyannote status without hard-failing.
- **Documentary evidence craft:** generalized Montara skill at
  `skills/meta/documentary-evidence-craft.md`; `warfront-craft.md` is a compatibility alias.
  `@montara/quality` now exposes executable evidence gates for source-backed
  claims, honest map precision, scene-mapped music cues, cold-open motion, and
  transcript-bound short cuts.
- **Local brain / project workspace:** `montara make --brain` probes local
  Ollama/LM Studio/llama.cpp and falls back to the deterministic planner with no
  cloud key; `montara project init` creates the gitignored project workspace
  convention with manifest and media/auth/render folders.
- **Layer 3 skills:** 69 installed `.agents/skills` packs covering GSAP, HyperFrames, Three.js,
  Manim, FFmpeg, video understanding, music, speech, Playwright, visual style, and character animation.
- **Runtime manager:** `@montara/runtimes` registers ComfyUI, A1111, Piper,
  Faster Whisper, and Transformers.js, reports health, emits managed
  install/launch dry-runs, writes env hints/scripts, inventories configured
  model/cache paths, and only executes external setup when the caller passes
  `--execute`.

## Latest Gates

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | passed |
| `pnpm montara -- stage1-audit --json --out out/stage1-audit.json` | 4/4 sections, 21/21 checks |
| `pnpm verify` | 324 passed, 0 failed |
| `pnpm validate` | 101 passed, 0 failed |
| `python -m pytest tests` | 399 passed, 8 skipped |

## Example Outputs

| Output | Path | Renderer |
| --- | --- | --- |
| Core validate render | `out/validate-compose-core.mp4` | FFmpeg fallback from Timeline IR |
| Core validate IR | `out/validate-compose-core.timeline.json` | Timeline IR |
| Render CLI auto exports | `out/validate-render-cli.mp4` + `.edl/.otio/.fcpxml` | `montara render` -> MP4 + editor bridge |
| Source understanding JSON | `out/validate-understanding.json` | `montara understand --vision off` -> signalstats fallback JSON; CLIP path is opt-in |
| Python video compose CLI smoke | `out/validate-cli-video-compose.mp4` | `montara compose` -> Python `video_compose` |
| Native Remotion smoke | `out/validate-remotion-native.mp4` | Remotion native spring/caption composition when composer deps are installed |
| Native Remotion Timeline | `out/validate-remotion-timeline-native.mp4` | Timeline IR -> Remotion props -> native `Explainer` render when `REMOTION_ENABLED=1` |
| Native HyperFrames smoke | `out/validate-hyperframes/validate-hyperframes-kinetic.mp4` | HyperFrames strict lint/validate/render kinetic typography when `npx hyperframes` is available |
| Character animation HyperFrames proof | `out/validate-character-animation/final.mp4` | SVG/GSAP character rig -> `video_compose` -> HyperFrames final MP4 when runtime is available |
| Headless validate render | `out/validate-headless.mp4` | FFmpeg path |
| Smart reel validate render | `out/validate-smart-reel.mp4` | FFmpeg reel path |
| Stage 3 local-brain smoke | `out/stage-3-local-brain-smoke.mp4` | `montara make --brain` with deterministic local fallback |
| URL reference preflight | `out/https-example-com-stage3-reference.analysis.json` | `montara analyze <url>` materialization/research preflight |
| Project workspace smoke | `projects/stage3-workspace-smoke/project.json` | `montara project init` gitignored workspace convention |
| Montara status report | `out/validate-montara-status.json` | CLI compare report for local capability and upstream parity |
| Stage 1 audit report | `out/stage1-audit.json` | `montara stage1-audit` proves Stage 1A-D bridge, pipeline, provider, and engine parity gates |
| Runtime health report | `out/validate-runtimes-status.json` | CLI report for ComfyUI/A1111/Piper/Faster Whisper/Transformers.js external runtime health |
| Runtime model inventory | `out/validate-runtime-inventory.json` | Configured model/cache path inventory; no directory scan or model download |
| Runtime manager script | `out/validate-comfyui-install.ps1` | Generated safe install script from the dry-run manager |
| Documentary corpus montage | `out/validate-documentary-montage.mp4` | Offline fixture corpus -> Python `clip_search` -> `video_compose` |
| 60s documentary open-stock proof | `out/validate-documentary-open-stock-60s.mp4` | `seed-open-stock-proof` -> `clip_search.select_slots` -> `video_compose` |
| Screen-demo capture proof | `out/validate-screen-demo.mp4` | Local recording artifact -> `montara capture pick-latest` -> `video_compose` |

Generated outputs live under `out/` and are not committed.
The README demo gallery and [docs/DEMOS.md](./DEMOS.md) now map these artifacts
and checked-in `assets/` proofs to commands, pipelines, runtimes, and cost
expectations.

## Tech Pack Status

| Tech | Current status |
| --- | --- |
| Remotion | Native smoke and Timeline IR render validate-gated when `remotion-composer` deps are installed; `REMOTION_ENABLED=1` makes `montara make/render` prefer native Remotion with FFmpeg fallback visible. |
| Revideo | Runtime-gated MIT fallback adapter/probe exists; license-aware open fallback selection is covered by `selectCompositionEngine`; installed-runtime MP4 validate proof pending. |
| Motion Canvas | Runtime-gated kinetic typography adapter/probe exists and remains the picker target for kinetic typography; installed-runtime MP4 validate proof pending. |
| HyperFrames | Python `hyperframes_compose` strict kinetic smoke and character SVG-rig final MP4 are validate-gated when HyperFrames is available; broader non-kinetic pipeline/runtime parity pending. |
| Three.js | Adapter package exists; native headless proof depends on browser/runtime. |
| Blender | Real adapter and native proof path when installed. |
| Manim | Adapter package exists; native binary optional. |
| Spline | Planned registry entry only. |
| FFmpeg | Fully working native renderer and fallback. |
| Playwright | Browser capture with `montara capture`, login/storageState workflow, and deterministic completed-recording pickup; runtime-gated on Node Playwright install for live browser recording. |
| ComfyUI / A1111 / Piper / Faster Whisper / Transformers.js | Health/status, install/launch dry-runs, env writers, generated scripts, and model/cache inventory exist in `@montara/runtimes`; real setup is opt-in with `--execute`. |

## Provider Executor Status

The TypeScript provider registry now includes an injectable BYOK executor and
redaction helper. `verify` and `validate` replay sanitized fixtures for BFL-style
async submit/poll/download without live keys or network calls. First-wave request
shape coverage includes OpenAI Images (`gpt-image-2`), BFL FLUX.2, Google Gemini
image through the Interactions API, Google Veo 3.1 with header-based
`x-goog-api-key`, and Runway Gen-4.5 `image_to_video` requests. The Python image
provider tools now also expose testable OpenAI/BFL request builders; `flux_image`
prefers direct BFL and keeps fal.ai as a compatibility fallback.

`montara providers audit` now writes a redacted fixture report covering every
cloud video/image/TTS/music provider in the registry, `montara providers
live-audit` writes a sanitized readiness ledger across cloud providers, and
`montara providers smoke <provider-id>` builds a dry-run request by default. A
real network smoke is blocked unless the caller passes `--live`, provides the
provider key, and sets `MONTARA_LIVE_PROVIDER_SMOKE=1`.

This is not yet a blanket production claim for every cloud provider. Python
provider tools and the cloud long tail still need real-key smoke confirmations;
the live-audit ledger records missing-key/opt-in/passed/failed status without
secrets. See [docs/PROVIDER-AUDIT.md](./PROVIDER-AUDIT.md).

## Voice And Audio Options

Best current path:

1. Use `hear` for LUFS, onset/pacing, loudness, spectral, and music QA.
2. Use scene-mapped music cues: fades, gain, intentional silence, no hard loops.
3. Use `tools/audio/voice_id.py` for consented speaker-similarity when optional dependencies are installed.
4. Keep celebrity/corpus matching as labelled-reference matching; do not imply rights to use a voice.
5. Use `skills/creative/music-intelligence.md`,
   `skills/creative/speaker-voice-intelligence.md`, and
   `skills/meta/documentary-evidence-craft.md` for agent guidance.

## Next Best Engineering Steps

1. Extend the documentary proof from fixture corpus to a longer open-stock corpus montage.
2. Add installed-runtime MP4 validate proofs for Revideo / Motion Canvas.
3. Run real live-key provider smoke confirmations where keys are available and record them in the live-audit ledger.
4. Continue local vision hardening with cached CLIP model validation and BLIP/caption coverage.
