# Attribution And Dependency Notes

Montara is distributed under AGPL-3.0. This document records major upstream and
runtime dependencies that agents and maintainers should keep in mind. It is not a
substitute for reviewing each dependency's own license before redistribution or
commercial deployment.

## Source Project

| Project | Role | License / note |
| --- | --- | --- |
| OpenMontage | Source-engine inspiration and derived Python/skill/test surfaces | AGPL-3.0 provenance boundary; see `docs/PORTING-PROVENANCE.md` and `NOTICE`. |

## Core Tooling

| Dependency | Role | Notes |
| --- | --- | --- |
| Node.js / TypeScript / esbuild | CLI, packages, test bundling | Development/runtime tooling. |
| Python | Tool registry and media engine | Python dependencies are listed in `requirements*.txt`. |
| FFmpeg / ffprobe | Media probe, render, audio, transcode, fallback path | External binary; license depends on build configuration. |
| GitHub Actions | CI | Runs typecheck, verify, validate, pytest. |

## Render / Composition Runtimes

| Runtime | Role | Notes |
| --- | --- | --- |
| Remotion | React composition surface | Source-available/commercial terms depend on use; validate before production. |
| Revideo | MIT fallback target | Runtime-gated. |
| Motion Canvas | Motion graphics target | Runtime-gated. |
| Three.js | WebGL/3D scenes | MIT; runtime-gated by browser/tooling. |
| Manim / ManimCE / ManimGL | Math and educational animation | Runtime-gated; use matching skill docs. |
| Blender | 3D rendering | GPL; invoked as an external process. |
| HyperFrames | HTML/GSAP video composition | External CLI/skills; validate runtime locally. |
| Playwright | Browser capture and authenticated web demos | Apache-2.0; auth state must never be committed. |

## Optional Model / Provider Surfaces

| Family | Role | Notes |
| --- | --- | --- |
| ComfyUI / A1111 | Local image/video model runtimes | Invoked externally; model licenses vary. |
| Piper | Local/offline TTS | Optional local runtime. |
| Whisper / WhisperX / speech-to-text providers | Transcription | Optional; check model/provider terms. |
| Resemblyzer / SpeechBrain / pyannote.audio | Speaker and diarization intelligence | Optional; respect consent and provider/model terms. |
| OpenAI, Google, ElevenLabs, Runway, BFL, Recraft, xAI, Kling, MiniMax, HeyGen, Suno | BYOK cloud providers | Request builders are not a substitute for live executor audits. See `docs/PROVIDER-AUDIT.md`. |

## Skill Packs

Layer 3 skills under `.agents/skills/` are instructional packs. They may include
examples, references, and scripts from their originating skill packages. Keep
their provenance files and references intact when present.

## Generated Media

Generated outputs, private recordings, Playwright auth state, corpora, model
weights, and user media are ignored by default and should not be committed.
The curated `assets/` demo gallery is the exception: those files are
Montara-owned generated proof assets with metadata in `assets/montara-assets.json`.
