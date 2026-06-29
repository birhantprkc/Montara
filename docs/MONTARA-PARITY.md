# Montara Parity And Moat Checklist

Last synced with [PLAN.md](../PLAN.md): 2026-06-29, after Stage 1A Playwright coverage.

This checklist tracks two things:

1. OpenMontage parity: what Montara must preserve or exceed from the source engine.
2. Montara moat: Timeline IR, editor bridges, local-first CLI, runtime honesty, content-aware reels,
   Playwright auth capture, and generalized documentary evidence craft.

Legend: `☑` done and gated, `◐` partial/runtime-gated, `☐` not done.

Latest local gates before this sync:

- `npm.cmd run typecheck` passed.
- `npm.cmd run verify` passed: 272 passed, 0 failed.
- `npm.cmd run validate` passed: 73 passed, 0 failed.
- `python -m pytest tests` passed: 363 passed, 8 skipped.

## Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Timeline IR | ☑ | Canonical JSON format; ScenePlan/edit decisions resolve into it. |
| FFmpeg renderer | ☑ | Universal native MP4 path and fallback. |
| Python tool engine | ☑ | Root-level `tools/` + `lib/`; engine bridge verifies dependency-free. |
| Engine bridge | ☑ | JSON bridge and composition <-> IR mapping. |
| CLI | ◐ | Core commands exist; not every Python tool is surfaced yet. |
| Editor export | ☑ | EDL, OTIO, FCPXML export verified. |
| Editor import | ☐ | Round-trip import remains Stage 3. |
| CI | ☑ | typecheck + verify + validate + pytest. |
| Docs honesty | ☑ | README/AGENT_GUIDE/ARCHITECTURE/PROVIDER-AUDIT/SKILL-ROADMAP/CAPABILITY-SNAPSHOT synced. |
| Agent contract | ☑ | AGENT_GUIDE now includes onboarding, runtime honesty, tool protocols, checkpoints, and commit rules. |
| Prompt gallery | ☑ | Expanded beyond OpenMontage gallery coverage; demo/cost docs remain a Stage 4 public-launch task. |
| Playwright capture | ◐ | Tool/selector/skills and pytest coverage exist; CLI wrapper pending. |
| 9-engine registry | ☑ | Includes maturity labels: working, adapter, runtime-gated, planned. |
| Native Remotion | ◐ | Adapter/composer surface; native validate pending. |
| HyperFrames | ◐ | Layer 2/3 skills and upstream guidance; Montara compose parity pending. |
| Revideo / Motion Canvas | ☐ | Registered/runtime-gated; native package work pending. |
| Three.js / Manim | ◐ | Adapters exist; native proof depends on installed runtimes. |
| Blender | ◐ | Real headless adapter; documented as runtime-gated. |
| Spline | ☐ | Planned registry entry only. |
| Local LLM orchestrator | ◐ | Backend catalogue/probes; full local brain not shipped. |
| CLIP/BLIP vision default | ☐ | Current default is FFmpeg/frame/audio signal analysis. |
| Cloud live executors | ◐ | Request builders and audit notes; sanitized live fixtures pending. |
| Legal/notice | ☑ | Root AGPL-3.0 LICENSE, NOTICE, and docs/ATTRIBUTION.md are present. |
| Web GUI / WARCUT | ☐ | Long-term product surface. |
| Runtimes manager | ☐ | No Pinokio-style ComfyUI/A1111 manager yet. |

## A. Composition And Render Engines

| Engine | Status | Current truth |
| --- | --- | --- |
| FFmpeg | ☑ | Working local native renderer and fallback. |
| Remotion | ◐ | Adapter/composition surface; native MP4 validate pending. |
| Revideo | ☐ | Runtime-gated adapter target. |
| Motion Canvas | ☐ | Runtime-gated adapter target. |
| HyperFrames | ◐ | Skills and upstream workflow present; CLI compose integration pending. |
| Three.js | ◐ | Headless/WebGL adapter path; native availability depends on browser/runtime. |
| Manim | ◐ | External adapter; native availability depends on Manim install. |
| Blender | ◐ | Real external adapter; native availability depends on Blender install. |
| Playwright | ◐ | Browser capture engine, not a composition renderer. |
| Spline | ☐ | Planned after native composition stabilizes. |

## B. Production Pipelines

| Pipeline | Status | Remaining work |
| --- | --- | --- |
| animated-explainer | ☑ | Manifest + skills + validate coverage. |
| animation | ☑ | Manifest + skills. |
| avatar-spokesperson | ☑ | Manifest + skills; runtime constraints documented. |
| cinematic | ☑ | Manifest + skills. |
| clip-factory | ☑ | Manifest + skills. |
| documentary-montage | ◐ | Needs CLI E2E validate using corpus/CLIP or stock-footage fallback. |
| hybrid | ☑ | Manifest + skills. |
| localization-dub | ☑ | Manifest + skills. |
| podcast-repurpose | ☑ | Manifest + skills. |
| screen-demo | ◐ | Playwright capture path needs validate case and CLI wrapper. |
| talking-head | ☑ | Manifest + skills. |
| character-animation | ☑ | Contract tests green. |
| kinetic-typography | ◐ | Present in `pipelines/`; promote to `pipeline_defs/`. |

## C-K. OpenMontage Parity Categories

| Category | Status | Notes |
| --- | --- | --- |
| C Video providers | ◐ | 14 registered; live executor audits pending. |
| D Image providers | ◐ | 10 registered; OpenAI/Google defaults updated; live fixtures pending. |
| E Audio/TTS/music | ◐ | Local/offline fallbacks and analysis exist; premium providers BYOK/runtime-gated. |
| F Post/enhancement | ◐ | Core FFmpeg operations work; model enhancers runtime-gated. |
| G Analysis/understanding | ◐ | Reference analysis and signalstats work; full CLIP/BLIP default pending. |
| H Intelligence | ◐ | Research/corpus/scoring ports exist; Python corpus not CLI-default. |
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

Moat completion: 4/15 done, 7 partial, 4 not done.

## Current Stage Exit Criteria

Stage 0 is complete: legal files exist, AGENT_GUIDE links onboarding, docs are synced,
and the Stage 0 gate set passed before commit `0x26`.

Stage 1 exits when:

- all partial pipelines have offline validate MP4 cases;
- Python compose/corpus tools are wired through CLI;
- Playwright capture has a CLI wrapper and validate smoke path.

Stage 2 exits when native Remotion, HyperFrames, and documentary stock-footage validate cases are green.
