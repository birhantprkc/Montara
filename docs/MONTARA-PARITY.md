# Montara Parity And Moat Checklist

Last synced with [PLAN.md](../PLAN.md): 2026-07-01, after Stage 1 runtime-manager expansion.

This checklist tracks two things:

1. OpenMontage parity: what Montara must preserve or exceed from the source engine.
2. Montara moat: Timeline IR, editor bridges, local-first CLI, runtime honesty, content-aware reels,
   Playwright auth capture, and generalized documentary evidence craft.

Legend: `☑` done and gated, `◐` partial/runtime-gated, `☐` not done.

Latest local gates before this sync:

- `npm.cmd run typecheck` passed.
- `npm.cmd run verify` passed: 310 passed, 0 failed.
- `npm.cmd run validate` passed: 92 passed, 0 failed.
- `python -m pytest tests` passed: 379 passed, 8 skipped.

## Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Timeline IR | ☑ | Canonical JSON format; ScenePlan/edit decisions resolve into it. |
| FFmpeg renderer | ☑ | Universal native MP4 path and fallback. |
| Python tool engine | ☑ | Root-level `tools/` + `lib/`; engine bridge verifies dependency-free. |
| Engine bridge | ☑ | JSON bridge and composition <-> IR mapping. |
| CLI | ◐ | Core commands plus `montara status`, `montara runtimes`, `montara compose`, `montara corpus`, `montara import`, `montara budget`, `montara resume`; not every Python tool wired. |
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
| HyperFrames | ◐ | Python `hyperframes_compose` strict kinetic smoke is validate-gated; kinetic-typography has pipeline skills; broader non-kinetic parity pending. |
| Revideo / Motion Canvas | ☐ | Registered/runtime-gated; native package work pending. |
| Three.js / Manim | ◐ | Adapters exist; native proof depends on installed runtimes. |
| Blender | ◐ | Real headless adapter; documented as runtime-gated. |
| Spline | ☐ | Planned registry entry only. |
| Local LLM orchestrator | ◐ | Backend catalogue/probes; full local brain not shipped. |
| CLIP/BLIP vision default | ◐ | Current default is FFmpeg/frame/audio signal analysis; optional Transformers.js CLIP classification is exposed through `montara understand --vision` when local model runtime is installed/enabled. |
| Cloud live executors | ◐ | TS executor + redaction + all-cloud sanitized fixtures + dry-run/live smoke harness; real-key confirmations pending. |
| Legal/notice | ☑ | Root AGPL-3.0 LICENSE, NOTICE, and docs/ATTRIBUTION.md are present. |
| Web GUI / WARCUT | ☐ | Long-term product surface. |
| Runtimes manager | ◐ | ComfyUI/A1111/Piper/Faster Whisper/Transformers.js health, dry-run install/launch plans, env writers, generated scripts, and model/cache inventory exist; web GUI integration pending. |

## A. Composition And Render Engines

| Engine | Status | Current truth |
| --- | --- | --- |
| FFmpeg | ☑ | Working local native renderer and fallback. |
| Remotion | ☑ | Native smoke + Timeline IR render validate-gated; FFmpeg fallback remains visible when native is disabled/unavailable. |
| Revideo | ☐ | Runtime-gated adapter target. |
| Motion Canvas | ☐ | Runtime-gated adapter target. |
| HyperFrames | ◐ | Strict kinetic smoke renders through `hyperframes_compose`; `montara compose` can route `video_compose` artifacts, native HyperFrames still runtime-gated. |
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
| character-animation | ☑ | Contract tests green. |
| kinetic-typography | ☑ | Manifest + HyperFrames-aware stage skills; native strict kinetic smoke validate-gated. |

## C-K. OpenMontage Parity Categories

| Category | Status | Notes |
| --- | --- | --- |
| C Video providers | ◐ | 14 registered; cloud request fixtures cover Kling/Runway/Veo/xAI/Higgsfield/MiniMax/HeyGen; real-key confirmations pending. |
| D Image providers | ◐ | 10 registered; OpenAI/BFL/Google TS request shapes, Python OpenAI/BFL image request builders, and all-cloud fixture report gated. |
| E Audio/TTS/music | ◐ | Local/offline fallbacks and analysis exist; TTS/music cloud fixtures covered; premium providers BYOK/runtime-gated. |
| F Post/enhancement | ◐ | Core FFmpeg operations work; model enhancers runtime-gated. |
| G Analysis/understanding | ◐ | Reference analysis, signalstats fallback, optional Transformers.js CLIP path, and `montara understand` CLI proof work; BLIP/default cached-weight validation pending. |
| H Intelligence | ◐ | Research/corpus/scoring ports exist; Python corpus has CLI source/build/search/status surface. |
| I Governance | ◐ | Quality gates exist; budget CLI wraps CostTracker and is pytest/CLI-smoke covered. |
| J Styles/output profiles | ☑ | 3 styles and 6 output profiles verified. |
| K Agent layer | ◐ | Skills/configs/schemas/checkpoints exist; resume CLI reports checkpoint state; broader onboarding depth pending. |

## Montara Moat

| # | Capability | Status |
| --- | --- | --- |
| M1 Editable Timeline IR | ☑ |
| M2 Pro-editor export | ☑ |
| M3 Pro-editor import | ☑ |
| M4 First-class `montara` CLI | ◐ |
| M5 Local LLM orchestrator | ◐ |
| M6 Runtimes manager | ◐ |
| M7 Web GUI | ☐ |
| M8 WARCUT desktop GUI | ☐ |
| M9 Runtime honesty layer | ☑ |
| M10 Playwright auth capture | ◐ |
| M11 Content-aware reel planner | ◐ |
| M12 Documentary evidence craft | ☑ |
| M13 Voice/hear intelligence | ◐ |
| M14 Dual orchestration | ◐ |
| M15 Strong CI | ☑ |
| M16 README demo gallery | ☑ |
| M17 Public demo assets | ☑ |

Moat completion: 6/17 done, 8 partial, 3 not done.

## Current Stage Exit Criteria

Stage 0 is complete: legal files exist, AGENT_GUIDE links onboarding, docs are synced,
and the Stage 0 gate set passed before commit `0x26`.

Stage 1B pipeline MP4 coverage is now closed. Broader Stage 1 exits when:

- all partial pipelines have offline validate MP4 cases, including `screen-demo`;
- Python compose/corpus tools are wired through CLI; (done in `0x32`)
- screen-demo uses the capture CLI in a real offline MP4 flow. (done in `0x47`)

Stage 2 has native Remotion, HyperFrames, and the 60s documentary corpus proof green in `validate`; remaining Stage 2 items are runtime/package maturity work rather than the blocked exit proof.
