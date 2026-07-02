# Montara Parity And Moat Checklist

Last synced with [PLAN.md](../PLAN.md): 2026-07-02, after the Stage 4 trust gap pass.

This checklist tracks two things:

1. OpenMontage parity: what Montara must preserve or exceed from the source engine.
2. Montara moat: Timeline IR, editor bridges, local-first CLI, runtime honesty, content-aware reels,
   Playwright auth capture, and generalized documentary evidence craft.

Legend: `☑` done and gated, `◐` partial/runtime-gated, `☐` not done.

Latest local gates before this sync:

- `npm.cmd run typecheck` passed.
- `pnpm montara -- stage1-audit --json --out out/stage1-audit.json` passed: 4/4 sections, 21/21 checks.
- `npm.cmd run verify` passed: 324 passed, 0 failed.
- `npm.cmd run validate` passed: 101 passed, 0 failed.
- `python -m pytest tests` passed: 399 passed, 8 skipped.

## Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Timeline IR | ☑ | Canonical JSON format; ScenePlan/edit decisions resolve into it. |
| FFmpeg renderer | ☑ | Universal native MP4 path and fallback. |
| Python tool engine | ☑ | Root-level `tools/` + `lib/`; engine bridge verifies dependency-free. |
| Engine bridge | ☑ | JSON bridge and composition <-> IR mapping. |
| CLI | ◐ | Core commands plus `montara status`, `montara runtimes`, `montara project init`, `montara make --brain`, `montara compose`, `montara corpus`, `montara import`, `montara budget`, `montara resume`; not every Python tool wired. |
| Editor export | ☑ | EDL, OTIO, FCPXML export verified and auto-written beside `montara render` MP4 outputs by default. |
| Editor import | ☑ | `montara import` EDL/OTIO/FCPXML → Timeline IR; verify round-trip green. |
| CI | ☑ | typecheck + verify + validate + pytest. |
| Docs honesty | ☑ | README/AGENT_GUIDE/ARCHITECTURE/PROVIDER-AUDIT/SKILL-ROADMAP/CAPABILITY-SNAPSHOT synced. Native render validation, provider-audit, launch-plan, and status-report guidance added. |
| Agent contract | ☑ | AGENT_GUIDE now includes onboarding, runtime honesty, tool protocols, checkpoints, and commit rules. |
| Prompt gallery | ☑ | Expanded beyond OpenMontage coverage; README + docs/DEMOS.md map local demos to commands/costs/assets. |
| Public launch plan | ☑ | `docs/LAUNCH-PLAN.md` maps YouTube/community proof videos to commands, artifacts, costs, caveats, and provider-audit rules. |
| Compare report automation | ☑ | `montara status --json --out ...` emits local capability, latest documented gates, and Montara-vs-upstream categories. |
| Playwright capture | ◐ | Tool/selector/skills, pytest coverage, and `montara capture` CLI exist; native browser runtime remains Playwright-gated. |
| 9-engine registry | ☑ | Includes maturity labels: working, adapter, runtime-gated, planned. |
| Native Remotion | ☑ | Native smoke + Timeline IR render validate-gated; `REMOTION_ENABLED=1` routes `montara make/render` through native Remotion when composer deps are installed. |
| HyperFrames | ◐ | Python `hyperframes_compose` strict kinetic smoke plus character-animation SVG rig final MP4 are validate-gated when HyperFrames is available; broader non-kinetic parity pending. |
| Revideo / Motion Canvas | ◐ | License-aware Revideo fallback selection and runtime-gated native adapter packages/probes exist; installed-runtime MP4 validate proof remains runtime-gated. |
| Three.js / Manim | ◐ | Adapters exist; native proof depends on installed runtimes. |
| Blender | ◐ | Real headless adapter; documented as runtime-gated. |
| Spline | ☐ | Planned registry entry only. |
| Local LLM orchestrator | ☑ | `montara make --brain` probes Ollama/LM Studio/llama.cpp, uses the first reachable local model, and falls back to deterministic local planning without cloud. |
| CLIP/BLIP vision default | ◐ | Current default is FFmpeg/frame/audio signal analysis; optional Transformers.js CLIP classification is exposed through `montara understand --vision` when local model runtime is installed/enabled. |
| Cloud live executors | ◐ | TS executor + redaction + all-cloud sanitized fixtures + dry-run/live smoke harness + batch live-readiness ledger; real-key confirmations pending. |
| Legal/notice | ☑ | Root AGPL-3.0 LICENSE, NOTICE, and docs/ATTRIBUTION.md are present. |
| Web GUI / WARCUT | ☐ | Long-term product surface. |
| Runtimes manager | ◐ | ComfyUI/A1111/Piper/Faster Whisper/Transformers.js health, dry-run install/launch plans, env writers, generated scripts, and model/cache inventory exist; web GUI integration pending. |

## A. Composition And Render Engines

| Engine | Status | Current truth |
| --- | --- | --- |
| FFmpeg | ☑ | Working local native renderer and fallback. |
| Remotion | ☑ | Native smoke + Timeline IR render validate-gated; FFmpeg fallback remains visible when native is disabled/unavailable. |
| Revideo | ◐ | Runtime-gated native adapter/probe target plus license-aware open fallback selector; needs installed-runtime MP4 validate proof. |
| Motion Canvas | ◐ | Runtime-gated native adapter/probe target and kinetic-typography picker default; needs installed-runtime MP4 validate proof. |
| HyperFrames | ◐ | Strict kinetic smoke and character SVG-rig final MP4 render through `hyperframes_compose` when available; `montara compose` can route `video_compose` artifacts, native HyperFrames still runtime-gated. |
| Three.js | ◐ | Headless/WebGL adapter path; native availability depends on browser/runtime. |
| Manim | ◐ | External adapter; native availability depends on Manim install. |
| Blender | ◐ | Real external adapter; native availability depends on Blender install. |
| Playwright | ◐ | Browser capture engine and `montara capture --url`; not a composition renderer. |
| Spline | ☐ | Planned after native composition stabilizes. |

## B. Production Pipelines

| Pipeline | Status | Remaining work |
| --- | --- | --- |
| animated-explainer | ☑ | Manifest + skills + validate coverage. |
| animation | ☑ | Manifest + skills. |
| avatar-spokesperson | ☑ | Manifest + skills; runtime constraints documented. |
| cinematic | ☑ | Manifest + skills. |
| clip-factory | ☑ | Manifest + skills. |
| documentary-montage | ☑ | Offline fixture corpus and 60s open-stock proof corpus -> `clip_search.select_slots` -> `video_compose` MP4 validate paths are green. Live downloads remain `corpus_builder`/source-runtime dependent. |
| hybrid | ☑ | Manifest + skills. |
| localization-dub | ☑ | Manifest + skills. |
| podcast-repurpose | ☑ | Manifest + skills. |
| screen-demo | ☑ | Offline capture artifact pickup -> `montara capture pick-latest` -> `video_compose` MP4 validate path is green. |
| talking-head | ☑ | Manifest + skills. |
| character-animation | ☑ | Contract tests plus validate-gated HyperFrames SVG rig -> final MP4 when runtime is available. |
| kinetic-typography | ☑ | Manifest + HyperFrames-aware stage skills; native strict kinetic smoke validate-gated; Motion Canvas picker target is runtime-gated. |

## C-K. OpenMontage Parity Categories

| Category | Status | Notes |
| --- | --- | --- |
| C Video providers | ◐ | 14 registered; cloud request fixtures cover Kling/Runway Gen-4.5/Veo/xAI/Higgsfield/MiniMax/HeyGen; every cloud video Python tool now exposes an offline `build_request()` with pytest parity; Google/Runway request shapes refreshed against current official docs; `providers live-audit` records live-readiness without secrets; real-key confirmations pending. |
| D Image providers | ◐ | 10 registered; OpenAI/BFL/Google Interactions API TS request shapes; Python OpenAI/BFL/Google-Imagen/Grok/Recraft image tools expose `build_request()` with pytest parity; all-cloud fixture report gated. |
| E Audio/TTS/music | ◐ | Local/offline fallbacks and analysis exist; TTS/music cloud fixtures covered; ElevenLabs/Google/OpenAI/Doubao TTS + Suno/ElevenLabs music tools expose `build_request()` with pytest parity; premium providers BYOK/runtime-gated. |
| F Post/enhancement | ◐ | Core FFmpeg operations work; model enhancers runtime-gated. |
| G Analysis/understanding | ◐ | Reference analysis, signalstats fallback, optional Transformers.js CLIP path, and `montara understand` CLI proof work; BLIP/default cached-weight validation pending. |
| H Intelligence | ◐ | Research/corpus/scoring ports exist; Python corpus has CLI source/build/search/status surface. |
| I Governance | ◐ | Quality gates exist; budget CLI wraps CostTracker and is pytest/CLI-smoke covered; documentary evidence gates block unsourced source-backed claims and unsupported precise maps. |
| J Styles/output profiles | ☑ | 3 styles and 6 output profiles verified. |
| K Agent layer | ◐ | Skills/configs/schemas/checkpoints exist; resume CLI reports checkpoint state; broader onboarding depth pending. |

## Montara Moat

| # | Capability | Status |
| --- | --- | --- |
| M1 Editable Timeline IR | ☑ |
| M2 Pro-editor export | ☑ |
| M3 Pro-editor import | ☑ |
| M4 First-class `montara` CLI | ◐ |
| M5 Local LLM orchestrator | ☑ |
| M6 Runtimes manager | ◐ |
| M7 Web GUI | ☐ |
| M8 WARCUT desktop GUI | ☐ |
| M9 Runtime honesty layer | ☑ |
| M10 Playwright auth capture | ◐ |
| M11 Content-aware reel planner | ☑ |
| M12 Documentary evidence craft | ☑ |
| M13 Voice/hear intelligence | ◐ |
| M14 Dual orchestration | ◐ |
| M15 Strong CI | ☑ |
| M16 README demo gallery | ☑ |
| M17 Public demo assets | ☑ |

Moat completion: 10/17 done, 5 partial, 2 not done.

## Current Stage Exit Criteria

Stage 0 is complete: legal files exist, AGENT_GUIDE links onboarding, docs are synced,
and the Stage 0 gate set passed before commit `0x26`.

Stage 1A-D parity is closed by `montara stage1-audit`, which checks the Python
bridge, 14 pipeline definitions, provider/request fixtures, local fallbacks,
agent skills, and the honest nine-engine registry from the local machine.

Stage 2 has native Remotion, HyperFrames kinetic typography, HyperFrames character animation, doctor/cache-warm setup, license-aware Revideo fallback selection, and the 60s documentary corpus proof covered in `validate`; the remaining Stage 2 item is the Motion Canvas installed-runtime MP4 proof.

Stage 3 now has local-brain `make` fallback, URL/file reference analysis, budget/resume/capture, editor import/export, documentary evidence gates, transcript-verified Shorts helpers, and the project workspace CLI covered by `verify`/`validate`. SpeechBrain and deeper CLIP/BLIP paths remain optional-runtime hardening.
