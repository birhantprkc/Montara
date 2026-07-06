<p align="center">
  <video src="demos/01-engine-matrix.mp4" poster="demos/posters/01-engine-matrix-poster.jpg" controls muted width="920"></video>
  <br/>
  <a href="demos/01-engine-matrix.mp4">Watch the full engine matrix demo</a>
</p>

<h1 align="center">Montara</h1>

<p align="center">
  <strong>Local-first video studio OS.</strong><br/>
  One Timeline IR. Many renderers. Real MP4s. Honest provider and runtime gates.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#what-montara-is">What It Is</a> |
  <a href="#what-is-tested-today">Tested Today</a> |
  <a href="#provider-surface">Providers</a> |
  <a href="#repository-layout">Layout</a> |
  <a href="#roadmap">Roadmap</a> |
  <a href="docs/ARCHITECTURE.md">Architecture</a>
</p>

---

Montara is an open, agent-ready video production system for making explainers,
reels, software demos, documentaries, trailers, motion graphics, and eventually
long-form films from one editable source of truth: the **Timeline IR**.

The idea is simple and very large:

> Give creators and AI agents a local-first video engine that can plan, assemble,
> render, QA, revise, and hand off video projects without locking the project
> inside one cloud tool.

Today Montara already renders real local MP4s, exports editor files, runs a
Python media engine, verifies many provider request shapes, and ships public demo
artifacts. The larger ambition is to scale the same IR and pipeline system from
30-second shorts to 12-minute documentaries and hour-long films. That long-form
ambition is a roadmap item, not a claim that every feature-length workflow is
fully production-tested today.

## What Montara Is

Montara is built around a few hard choices:

| Principle | What it means |
| --- | --- |
| **One Timeline IR** | Scene plans, edit decisions, imported editor cuts, and generated assets resolve into one JSON timeline. |
| **Local-first** | With zero API keys, Montara still creates watchable MP4s using FFmpeg, caption cards, local/system voice paths, and deterministic fallbacks. |
| **Provider-pluggable** | Cloud providers are BYOK. Montara builds and audits request specs, but live paid calls require explicit opt-in. |
| **Renderer-honest** | FFmpeg is the universal floor. Remotion, HyperFrames, Blender, Three.js, Manim, Motion Canvas, Revideo, Playwright, and local model runtimes are used only when available. |
| **Agent-ready** | Humans, Codex, Cursor, local models, or Montara's own orchestrator read the same `skills/`, operate through the same CLI, and leave verifiable artifacts. |
| **Editor-friendly** | Renders can export EDL, OTIO, and FCPXML so work can continue in Premiere, Resolve, or Final Cut. |
| **Documentary-grade honesty** | Claims, maps, music cues, transcript cut points, and source footage are treated as quality gates, not vibes. |

## What It Can Aim To Make

Montara is designed as a general video production substrate, not a single-format
demo app.

| Format | Current truth |
| --- | --- |
| Animated explainers | Tested through `montara make`, Timeline IR, FFmpeg/Remotion fallback, and validate MP4s. |
| YouTube Shorts / Reels | Tested through reel helpers, vertical output profiles, transcript-bound cut gates, and demo artifacts. |
| Documentary montage | Tested with offline fixture corpus and a 60-second open-stock proof. Live publication footage depends on source adapters and provenance review. |
| Screen demos / product walkthroughs | Tested via capture artifact pickup and browser-capture CLI surfaces. Live Playwright recording is runtime-gated. |
| Kinetic typography | HyperFrames strict smoke is validate-gated when runtime is present; Motion Canvas native proof remains runtime-gated. |
| Character animation | SVG/GSAP rig to HyperFrames final MP4 is validate-gated when HyperFrames is present. |
| 3D / math / cinematic scenes | Three.js, Blender, Manim, Revideo, Motion Canvas adapters exist; native proof quality varies by installed runtime. |
| Long documentaries and movies | The IR, pipelines, corpus, provider, and runtime layers are designed for this. Full 12-minute/1-hour production workflows still need longer-form validation, shot continuity, asset budgeting, and heavier QA. |

## Quick Start

Prerequisites:

- Node.js 18+; Node 22+ recommended for some runtime tooling
- `pnpm`
- FFmpeg and ffprobe on `PATH`
- Python 3.10+ for the Python media engine

```bash
git clone https://github.com/abhinavshrivastava950/Montara.git
cd Montara
pnpm install
copy .env.example .env
pnpm run montara doctor
pnpm run montara start
```

PowerShell-friendly commands:

```powershell
pnpm run montara doctor
pnpm run montara status --json --out out/montara-status.json
pnpm run montara make --pipeline animated-explainer --seconds 20 "Explain Montara's Timeline IR"
```

No API key is required for the basic local path. Add keys only for the providers
you want to test.

## Studio Flow

`montara start` is the beginner-facing entry point:

```text
Montara is started.
What can I do for you today?

  1. Create videos
  2. Edit videos

How would you like to make your video?
  1. Instagram Reel
  2. YouTube Short
  3. YouTube video
  4. Documentary
  5. Animated explainer
  6. Screen demo
```

Non-interactive example:

```bash
pnpm run montara start --non-interactive create \
  --kind documentary \
  --niche geopolitics \
  --topic "Why chokepoints still shape global trade" \
  --seconds 60
```

## Public Demo Gallery

The repo includes a tighter public demo set under `demos/`. These are the demos
to show first. The old low-motion text-card clips were removed from the public
gallery because they did not represent the ambition of the engine.

| Demo | What it proves | API used for checked artifact | Preview |
| --- | --- | --- | --- |
| Full engine matrix | One polished chaptered video covering FFmpeg, Remotion, HyperFrames, Blender, Three.js, Manim, Revideo, Motion Canvas, and Playwright, with status labels for runtime-gated engines | none | [video](demos/01-engine-matrix.mp4) / [poster](demos/posters/01-engine-matrix-poster.jpg) |
| Documentary studio proof | Remotion documentary UI, d3-geo map motion, source chips, cinematic evidence framing, and FFmpeg mux/probe/poster output | none | [video](demos/02-documentary-studio.mp4) / [poster](demos/posters/02-documentary-studio-poster.jpg) |

<p align="center">
  <video src="demos/01-engine-matrix.mp4" poster="demos/posters/01-engine-matrix-poster.jpg" controls muted width="760"></video>
  <br/>
  <img src="demos/posters/01-engine-matrix-poster.jpg" alt="Full engine matrix poster" width="760" />
  <br/>
  <img src="demos/posters/02-documentary-studio-poster.jpg" alt="Documentary studio poster" width="760" />
</p>

The engine matrix is deliberately honest: it demonstrates FFmpeg and Remotion as
local render paths, and it shows HyperFrames, Blender, Three.js, Manim, Revideo,
Motion Canvas, and Playwright with their actual shipped adapter/probe/runtime
status. It does not fake a native Blender, Manim, Revideo, or Motion Canvas
render when that runtime is not installed.

Regenerate the public demos:

```bash
pnpm demos:generate
```

The generator uses only keys present in `.env`. It does not require paid
voice/music APIs; `MONTARA_TTS_PROVIDER=system` is the default demo voice path.

## What Is Tested Today

Latest local gate snapshot from the current public-polish branch:

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | passed on this public-polish pass |
| `pnpm verify` | 324 passed, 0 failed on this public-polish pass |
| `pnpm validate` | 101 passed, 0 failed on this public-polish pass |
| `pnpm run montara stage1-audit --json --out out/stage1-audit.json` | 4/4 sections, 21/21 checks on this public-polish pass |
| `python -m pytest tests` | not rerun here because the available Python 3.13 interpreter does not have `pytest`; last recorded Stage 4 gate was 399 passed, 8 skipped |

These tests cover:

- Timeline IR validation, editing operations, render paths, and editor bridge export/import
- FFmpeg real MP4 rendering and post-render QA
- Remotion native smoke when installed and FFmpeg fallback when not
- HyperFrames kinetic and character-rig paths when available
- provider request builders, redaction, dry-run/live-audit plumbing
- local fallbacks for video/image/speech/music
- corpus/search/compose workflows for documentary montage
- Playwright/capture command surfaces and Python capture tests
- documentary evidence gates and transcript-safe short cuts

Not fully tested yet:

- real live-key confirmation for every cloud provider
- full feature-length movie workflows
- installed-runtime native proofs for every renderer on every OS
- BLIP/default local vision captioning beyond optional CLIP/signalstats paths
- public SDK and GUI/WARCUT product surfaces

## Provider Surface

Montara exposes many provider paths, but it is careful about the word
"supported":

- **Verified offline:** request shape, redaction, fallback behavior, and dry-run
  ledger are tested.
- **Live confirmed:** a real key was used recently and a sanitized artifact was
  recorded.
- **Runtime-gated:** it works only if you installed the local runtime or model.
- **Planned:** the architecture has a slot, but it should not be sold as shipped.

Current registry surface:

| Category | Providers / runtimes | Current truth |
| --- | --- | --- |
| Video cloud | Kling, Runway Gen-4.5, Google Veo 3.1, xAI Grok Video, Higgsfield, MiniMax, HeyGen | request builders + sanitized fixtures; real-key confirmations still BYOK follow-up |
| Video local | WAN, Hunyuan, CogVideo, LTX via ComfyUI | runtime manager and request surface; actual quality depends on local GPU/models |
| Stock video | Pexels, Pixabay, Wikimedia | Pexels/Pixabay key paths; Wikimedia keyless network opt-in |
| Image cloud | BFL FLUX.2, Google Gemini image, xAI Grok image, OpenAI Images, Recraft | request builders + sanitized fixtures; live confirmation per key |
| Image local/stock | Stable Diffusion via ComfyUI/A1111, Manim frames, Pexels, Pixabay, Unsplash | runtime/stock gated |
| TTS | system voice, Piper, ElevenLabs, Google TTS, OpenAI TTS, Doubao Speech in Python tools | system/local fallbacks tested; cloud request builders and tools require keys |
| Music/SFX | tone-score fallback, Suno, ElevenLabs Music, ElevenLabs SFX | fallback tested; cloud paths BYOK/live-audit gated |
| STT/captions | Groq Whisper when key exists, faster-whisper when installed | Groq path is implemented; local faster-whisper remains runtime-gated |

Before spending money, run:

```bash
pnpm run montara providers audit --out out/provider-audit-fixtures.json
pnpm run montara providers live-audit --out out/provider-live-audit.json
pnpm run montara providers smoke flux --category image --json
```

Live calls require:

```bash
MONTARA_LIVE_PROVIDER_SMOKE=1
```

plus the provider key and `--live`.

## Environment

Copy `.env.example` to `.env`. The example file intentionally lists more than
the demo minimum so a founder, evaluator, or agent can see the provider surface.
Empty values are safe; Montara falls back locally when keys are absent.

Never commit `.env`, auth state files, model weights, customer media, or private
generated outputs.

## Core Commands

```bash
pnpm run montara doctor
pnpm run montara status --json --out out/montara-status.json
pnpm run montara stage1-audit --json --out out/stage1-audit.json
pnpm run montara start
pnpm run montara plan "Make a 45-second explainer about why the sky is blue"
pnpm run montara make --brain --seconds 20 "Make a local-first documentary cold open"
pnpm run montara render out/timeline.json
pnpm run montara import out/edit.fcpxml
pnpm run montara export out/timeline.json --to otio out/edit.otio
pnpm run montara analyze https://example.com/reference-video
pnpm run montara understand source.mp4 --vision auto
pnpm run montara reel source.mp4 out/short.mp4 --style cinematic
pnpm run montara capture login --url https://example.com
pnpm run montara capture --url https://example.com out/browser-capture.mp4
pnpm run montara corpus sources
pnpm run montara runtimes status --json --out out/runtimes-status.json
pnpm run montara providers live-audit --out out/provider-live-audit.json
```

## Engines And Runtimes

| Engine/runtime | Role | Current status |
| --- | --- | --- |
| FFmpeg | universal assembly, encode, probe, audio, thumbnails, shorts | working local floor |
| Remotion | React motion graphics, explainer/documentary compositions | native smoke validate-gated when composer deps installed; `REMOTION_ENABLED=1` opts in |
| HyperFrames | HTML/CSS/GSAP kinetic typography and character SVG rigs | validate-gated when `npx hyperframes` resolves |
| Blender | external 3D rendering | adapter exists; native runtime-gated |
| Three.js | headless/WebGL 3D proofs | adapter exists; runtime-gated/fallback path |
| Manim | math/diagram animation | adapter exists; runtime-gated |
| Revideo | MIT composition fallback target | selector/probe exists; installed MP4 proof pending |
| Motion Canvas | kinetic typography target | adapter/probe exists; installed MP4 proof pending |
| Playwright | browser capture, login storageState | CLI and tests exist; live browser runtime-gated |
| ComfyUI / A1111 | local image/video model servers | external runtime manager, dry-run install/launch guidance |
| Piper / faster-whisper / Transformers.js | local TTS, STT, CLIP-style vision | runtime inventory and optional paths |

Montara never vendors model weights. Keep runtimes, caches, and model licenses
outside the repository.

## Architecture

```text
idea/source/reference
  -> research / understand / hear
  -> pipeline skills
  -> ScenePlan / edit decisions
  -> Timeline IR
  -> renderer adapter
  -> MP4 + QA + self-review
  -> optional EDL / OTIO / FCPXML
```

The Python engine at repo root (`tools/`, `lib/`, `pipeline_defs/`, `schemas/`)
is driven through `engine_bridge.py` and the TypeScript CLI. The TypeScript side
owns the IR, provider registry, render adapters, gates, and public command
surface.

## Repository Layout

The root stays intentionally small. Runtime-critical entrypoints remain at the
top level, while reference docs and helper scripts live under their own folders.

| Path | What belongs there |
| --- | --- |
| `README.md`, `PLAN.md`, `AGENTS.md`, `AGENT_GUIDE.md` | first-read project and agent contracts |
| `packages/` | TypeScript workspaces: CLI, IR, renderers, providers, quality gates |
| `tools/`, `lib/`, `schemas/`, `pipeline_defs/`, `skills/` | Python media engine and shared skill layer; kept at root for bridge compatibility |
| `remotion-composer/` | native Remotion composition project and demo compositions |
| `scripts/` | verification, validation, demo generation, and legacy demo render helpers |
| `docs/` | architecture, provider docs, prompt gallery, provenance, launch notes |
| `demos/` | checked-in public MP4s, posters, and demo manifest only |
| `out/`, `projects/`, `.python-packages/`, `.pnpm-store/` | local generated/runtime state; ignored |

## Roadmap

What is already solid:

- Timeline IR core
- FFmpeg render floor
- editor export/import
- Stage 1 parity audit
- provider request fixtures and live-readiness ledger
- public demo gallery
- documentary evidence gates
- local-brain fallback path for `montara make --brain`

What still needs hardening:

- real BYOK live smokes for the long-tail cloud providers
- Motion Canvas and Revideo installed-runtime MP4 proofs
- full cached local CLIP/BLIP vision validation
- longer documentary/film-scale workflows with continuity and budget QA
- public SDK
- `montara serve` web GUI
- WARCUT desktop GUI on the same IR

## Repository Hygiene

Tracked on purpose:

- source code, skills, docs, schemas, tests
- public demo MP4s/posters in `demos/`
- demo manifest and reproducible generator script

Ignored on purpose:

- `.env`, auth state, service-account files, API tokens
- `out/`, `projects/`, scratch outputs, private generated media
- model weights, ONNX/GGUF files, runtime caches
- demo scratch workspace `demos/.work/` and demo generation logs

## Important Docs

- [PLAN.md](PLAN.md): master build plan and staged roadmap
- [AGENT_GUIDE.md](AGENT_GUIDE.md): operating contract for assistants
- [docs/CAPABILITY-SNAPSHOT.md](docs/CAPABILITY-SNAPSHOT.md): what works now
- [docs/MONTARA-PARITY.md](docs/MONTARA-PARITY.md): parity/moat checklist
- [docs/PROVIDER-AUDIT.md](docs/PROVIDER-AUDIT.md): provider fixture and live-smoke policy
- [docs/DEMOS.md](docs/DEMOS.md): proof ledger
- [docs/PROMPT_GALLERY.md](docs/PROMPT_GALLERY.md): prompts that exercise real paths
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md): architecture conventions
- [docs/PORTING-PROVENANCE.md](docs/PORTING-PROVENANCE.md): provenance and attribution record

## Provenance

Montara is primarily inspired by and partially derived from
`calesthio/OpenMontage` (AGPL-3.0), tracked in [NOTICE](NOTICE) and
[docs/PORTING-PROVENANCE.md](docs/PORTING-PROVENANCE.md). The Montara-specific
Timeline IR, TypeScript CLI/workspaces, runtime gates, provider audit layer,
and public demo packaging are Montara / Warfront AI work unless a file says
otherwise.

Other projects named in this repo, including FFmpeg, Remotion, HyperFrames,
Revideo, Motion Canvas, Three.js, Manim, Blender, ComfyUI, A1111, Piper,
faster-whisper, and Transformers.js, are external tools or runtimes that
Montara invokes or integrates with. See [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)
for the attribution table.

## License

Montara is AGPL-3.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and
[docs/ATTRIBUTION.md](docs/ATTRIBUTION.md).

Do not commit secrets, private customer media, third-party model weights, or
provider outputs whose license does not allow public redistribution.
