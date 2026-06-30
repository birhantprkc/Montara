# Montara Parity And Moat Checklist

Last synced with [PLAN.md](../PLAN.md): 2026-06-30, after Stage 4.5A provider executor fixtures.

This checklist tracks two things:

1. OpenMontage parity: what Montara must preserve or exceed from the source engine.
2. Montara moat: Timeline IR, editor bridges, local-first CLI, runtime honesty, content-aware reels,
   Playwright auth capture, and generalized documentary evidence craft.

Legend: `☑` done and gated, `◐` partial/runtime-gated, `☐` not done.

Latest local gates before this sync:

- `npm.cmd run typecheck` passed.
- `npm.cmd run verify` passed: 278 passed, 0 failed.
- `npm.cmd run validate` passed: 81 passed, 0 failed.
- `python -m pytest tests` passed: 367 passed, 9 skipped.

## Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Timeline IR | ☑ | Canonical JSON format; ScenePlan/edit decisions resolve into it. |
| FFmpeg renderer | ☑ | Universal native MP4 path and fallback. |
| Python tool engine | ☑ | Root-level `tools/` + `lib/`; engine bridge verifies dependency-free. |
| Engine bridge | ☑ | JSON bridge and composition <-> IR mapping. |
| CLI | ◐ | Core commands plus `montara compose` and `montara corpus`; budget/resume/editor import still pending. |
| Editor export | ☑ | EDL, OTIO, FCPXML export verified. |
| Editor import | ☐ | Round-trip import remains Stage 3. |
| CI | ☑ | typecheck + verify + validate + pytest. |
| Docs honesty | ☑ | README/AGENT_GUIDE/ARCHITECTURE/PROVIDER-AUDIT/SKILL-ROADMAP/CAPABILITY-SNAPSHOT synced. |
| Agent contract | ☑ | AGENT_GUIDE now includes onboarding, runtime honesty, tool protocols, checkpoints, and commit rules. |
| Prompt gallery | ☑ | Expanded beyond OpenMontage coverage; README + docs/DEMOS.md map local demos to commands/costs/assets. |
| Playwright capture | ◐ | Tool/selector/skills, pytest coverage, and `montara capture` CLI exist; native browser runtime remains Playwright-gated. |
| 9-engine registry | ☑ | Includes maturity labels: working, adapter, runtime-gated, planned. |
| Native Remotion | ◐ | Native smoke MP4 validate-gated when composer deps are installed; default Timeline routing pending. |
| HyperFrames | ◐ | Python `hyperframes_compose` strict kinetic smoke is validate-gated; kinetic-typography has pipeline skills; broader non-kinetic parity pending. |
| Revideo / Motion Canvas | ☐ | Registered/runtime-gated; native package work pending. |
| Three.js / Manim | ◐ | Adapters exist; native proof depends on installed runtimes. |
| Blender | ◐ | Real headless adapter; documented as runtime-gated. |
| Spline | ☐ | Planned registry entry only. |
| Local LLM orchestrator | ◐ | Backend catalogue/probes; full local brain not shipped. |
| CLIP/BLIP vision default | ☐ | Current default is FFmpeg/frame/audio signal analysis. |
| Cloud live executors | ◐ | TS executor + redaction + first-wave sanitized fixtures; remaining providers and Python tools pending. |
| Legal/notice | ☑ | Root AGPL-3.0 LICENSE, NOTICE, and docs/ATTRIBUTION.md are present. |
| Web GUI / WARCUT | ☐ | Long-term product surface. |
| Runtimes manager | ☐ | No Pinokio-style ComfyUI/A1111 manager yet. |

## A. Composition And Render Engines

| Engine | Status | Current truth |
| --- | --- | --- |
| FFmpeg | ☑ | Working local native renderer and fallback. |
| Remotion | ◐ | Native smoke MP4 validate-gated; full Timeline default routing pending. |
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
| documentary-montage | ◐ | Corpus build/search CLI exists; needs stock-footage MP4 E2E validate. |
| hybrid | ☑ | Manifest + skills. |
| localization-dub | ☑ | Manifest + skills. |
| podcast-repurpose | ☑ | Manifest + skills. |
| screen-demo | ◐ | Capture CLI smoke is validated; full screen-demo MP4 flow still pending. |
| talking-head | ☑ | Manifest + skills. |
| character-animation | ☑ | Contract tests green. |
| kinetic-typography | ☑ | Manifest + HyperFrames-aware stage skills; native strict kinetic smoke validate-gated. |

## C-K. OpenMontage Parity Categories

| Category | Status | Notes |
| --- | --- | --- |
| C Video providers | ◐ | 14 registered; Runway/Veo TS request shapes fixture-gated; remaining live audits pending. |
| D Image providers | ◐ | 10 registered; OpenAI/BFL/Google TS request shapes and BFL-style executor fixture gated. |
| E Audio/TTS/music | ◐ | Local/offline fallbacks and analysis exist; premium providers BYOK/runtime-gated. |
| F Post/enhancement | ◐ | Core FFmpeg operations work; model enhancers runtime-gated. |
| G Analysis/understanding | ◐ | Reference analysis and signalstats work; full CLIP/BLIP default pending. |
| H Intelligence | ◐ | Research/corpus/scoring ports exist; Python corpus has CLI source/build/search/status surface. |
| I Governance | ◐ | Quality gates exist; budget CLI pending. |
| J Styles/output profiles | ☑ | 3 styles and 6 output profiles verified. |
| K Agent layer | ◐ | Skills/configs/schemas/checkpoints exist; resume CLI/onboarding depth pending. |

## Montara Moat

| # | Capability | Status |
| --- | --- | --- |
| M1 Editable Timeline IR | ☑ |
| M2 Pro-editor export | ☑ |
| M3 Pro-editor import | ☐ |
| M4 First-class `montara` CLI | ◐ |
| M5 Local LLM orchestrator | ◐ |
| M6 Runtimes manager | ☐ |
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

Moat completion: 6/17 done, 7 partial, 4 not done.

## Current Stage Exit Criteria

Stage 0 is complete: legal files exist, AGENT_GUIDE links onboarding, docs are synced,
and the Stage 0 gate set passed before commit `0x26`.

Stage 1 exits when:

- all partial pipelines have offline validate MP4 cases;
- Python compose/corpus tools are wired through CLI; (done in `0x32`)
- screen-demo uses the capture CLI in a real offline MP4 flow.

Stage 2 exits when native Remotion, HyperFrames, and documentary stock-footage validate cases are green.
