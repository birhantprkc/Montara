# Montara — Master Build Plan

> **Last updated:** 2026-06-29  
> **Authority:** This file is the single build contract for Montara. For runtime truth see
> [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). For parity tick-list see
> [docs/MONTARA-PARITY.md](./docs/MONTARA-PARITY.md) (must stay in sync with this plan).

---

## North star

**Montara must outperform OpenMontage everywhere that matters** — not by copying louder
marketing, but by shipping a **strictly better system**:

1. Everything OpenMontage can do (pipelines, tools, providers, governance, composition paths).
2. **Plus Montara-only moat:** editable Timeline IR, CLI/SDK, pro-editor bridges, local-first
   orchestration, runtime honesty, content-aware reels, Playwright auth capture, documentary
   evidence craft, and eventually WARCUT/web GUIs on the same IR.

**Win condition:** A new user (or agent) can run `montara doctor` → `montara make "…"` → get a
real MP4 + Timeline IR + optional EDL/OTIO/FCPXML, with zero API keys, honest runtime reporting,
and quality gates that block broken delivery — **without** needing OpenMontage at all.

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ☑ | **Done** — shipped, documented, and covered by a green gate or explicit acceptance test |
| ◐ | **Partial** — exists but not production-default, missing tests, or honest caveats apply |
| ☐ | **Not done** — not shipped or not validated |
| 🎯 | **Current focus** — active sprint priority |

**Gate commands (must pass before claiming a phase done):**

```bash
pnpm typecheck
pnpm verify      # contract tests (~271+ assertions; see scripts/verify.ts)
pnpm validate    # end-to-end flows (~77 assertions; real MP4 on disk)
python -m pytest tests
```

CI: [.github/workflows/ci.yml](./.github/workflows/ci.yml) runs all of the above on every push.

---

## Snapshot — as of 2026-06-29

| Area | Status | Notes |
|------|--------|-------|
| **Timeline IR** (`@montara/core`) | ☑ | Canonical JSON format; validate + render paths green |
| **FFmpeg render** (`@montara/render-ffmpeg`) | ☑ | Universal native renderer + fallback floor |
| **Python engine** (`tools/`, `lib/`) | ☑ | 116 tools (115 parity + `playwright_recorder`), 18 lib modules at repo root |
| **Engine bridge** (`engine_bridge.py`, `@montara/engine`) | ☑ | Stdlib JSON bridge; AST verify; composition ↔ IR mapping |
| **CLI** (`packages/cli`) | ◐ | doctor, make, plan, render, export, hear, understand, engines — not every Python tool wired |
| **Editor export** (EDL, OTIO, FCPXML) | ☑ | `@montara/bridge`; verify tests green |
| **Editor import** (round-trip) | ☐ | Export only today |
| **CI** | ☑ | typecheck + verify + validate + pytest (+ optional native-render smoke) |
| **Docs honesty** | ☑ | README, AGENT_GUIDE, ARCHITECTURE, PROVIDER-AUDIT, SKILL-ROADMAP, MONTARA-PARITY synced |
| **Agent contract** | ☑ | AGENT_GUIDE includes onboarding, runtime honesty, pipeline/stage/tool/checkpoint protocols |
| **PROMPT_GALLERY** | ☑ | Expanded beyond OpenMontage gallery coverage |
| **Playwright capture** | ◐ | Tool + selector + Layer 2 skills + pytest + `montara capture`; runtime-gated on `playwright` npm |
| **9-engine registry** | ☑ | Honest `maturity` labels (working / adapter / runtime-gated / planned) |
| **Remotion native** | ◐ | Native smoke MP4 validate-gated when composer deps are installed; default Timeline routing pending |
| **HyperFrames native** | ◐ | Strict kinetic smoke renders through `hyperframes_compose`; broader pipeline parity pending |
| **Revideo / Motion Canvas native** | ☐ | Registered; packages not fully implemented |
| **Three.js / Manim native** | ◐ | Adapters exist; often FFmpeg fallback proofs |
| **Blender native** | ◐ | Real headless adapter; proof clip exists |
| **Spline** | ☐ | Planned registry entry only |
| **Local LLM orchestrator** | ◐ | `@montara/llm` catalogue + Ollama probe; not full `montara make` brain |
| **CLIP/BLIP vision default** | ☐ | FFmpeg/signalstats today; Python `clip_embedder` not default in TS path |
| **Cloud live executors** | ◐ | BYOK request builders; PROVIDER-AUDIT documents gaps |
| **LICENSE / NOTICE** | ☑ | Root AGPL-3.0 LICENSE + NOTICE + docs/ATTRIBUTION.md |
| **Web GUI** | ☐ | `packages/web` scaffold only |
| **WARCUT desktop** | ☐ | Not started |
| **`runtimes` manager** | ☐ | No Pinokio-style ComfyUI/A1111 installer package |
| **Public demo gallery** | ☐ | Local `out/` + `assets/` proofs; no OpenMontage-scale README demos |

### Competitive score vs OpenMontage (today)

| Criterion | OpenMontage | Montara | Leader |
|-----------|-------------|---------|--------|
| CI / gates | lint + pytest | typecheck + verify + validate + pytest | **Montara** |
| Runtime honesty | implicit | explicit ARCHITECTURE + AGENT_GUIDE tables | **Montara** |
| Timeline IR + editor export | none | EDL/OTIO/FCPXML | **Montara** |
| CLI | none | `montara` commands | **Montara** |
| Playwright auth capture | none | `playwright_recorder` | **Montara** |
| Documentary evidence craft | brand-specific | generalized skill | **Montara** |
| README / demos / community | strong | thin | **OpenMontage** |
| AGENT_GUIDE depth | ~481 lines | ~484 lines + Montara-specific protocols | **Montara** |
| HyperFrames / Remotion default path | battle-tested | adapter + fallback | **OpenMontage** |
| `make setup` one-command | yes | `montara doctor` partial | **OpenMontage** |
| Public proof videos | many documented | few local proofs | **OpenMontage** |

**Current overall leader for production video today:** OpenMontage — gap is **closing**.

---

## 1. Definition (unchanged intent)

Montara turns an idea, notes, URL, script, or source footage into a finished video. One
**Timeline IR** is the source of truth. Agents build it; humans edit it (future GUIs); pro
editors import it; every renderer compiles it.

**Drive surfaces:** your AI assistant (reads `AGENT_GUIDE.md` + `skills/`) **or**
`montara` CLI **or** (future) web/WARCUT GUI — same skills, same IR, same gates.

**WARCUT** = premium desktop GUI on top of Montara (not a separate engine).

---

## 2. Non-negotiables

1. **Python engine at repo root** — `tools/`, `lib/`, `skills/`, `pipeline_defs/`. There is no
   `python/` subfolder; `engine_bridge.py` is the boundary. TypeScript owns IR, CLI, adapters, gates.
2. **Local-first** — zero API keys must still yield a watchable MP4 (Piper, FFmpeg, free stock, caption cards).
3. **IR-centric** — no parallel final video format; ScenePlan and edit decisions resolve to Timeline IR.
4. **Dual orchestration, one knowledge** — assistant and `montara make` read the same `skills/`.
5. **Never hard-fail** — degrade with logged decision; always prefer a working MP4 over a crash.
6. **Test-gated** — red `verify` or `validate` = phase not done.
7. **Runtime honesty** — never claim native Remotion/HyperFrames/CLIP because a package name exists.
8. **Open + attributed** — AGPL-3.0; [docs/PORTING-PROVENANCE.md](./docs/PORTING-PROVENANCE.md).

---

## 3. Montara moat (what OpenMontage cannot match)

Complete these to **win everywhere**, not just tie:

| # | Moat capability | Status | OpenMontage has it? |
|---|-----------------|--------|---------------------|
| M1 | **Editable Timeline IR** as canonical format | ☑ design + core | No |
| M2 | **Pro-editor export** (EDL, OTIO, FCPXML) on every render | ☑ | No |
| M3 | **Pro-editor import** (round-trip edit in Premiere/DaVinci/FCP) | ☐ | No |
| M4 | **`montara` CLI** as first-class entry (not agent-only) | ◐ | No |
| M5 | **Local LLM orchestrator** (`montara make` via Ollama/LM Studio) | ◐ | No (planned upstream) |
| M6 | **`runtimes` manager** (one-click ComfyUI/A1111/Piper/Whisper) | ☐ | Partial (`make setup`) |
| M7 | **Web GUI** (`montara serve`) | ☐ | No |
| M8 | **WARCUT desktop GUI** on same IR | ☐ | No |
| M9 | **Runtime honesty layer** (maturity labels, ARCHITECTURE truth) | ☑ | No |
| M10 | **Playwright auth browser capture** (`storageState` workflow) | ◐ | No |
| M11 | **Content-aware reel planner** (topic overlays, not template hooks) | ◐ | No |
| M12 | **Documentary evidence craft** (generalized, source-backed) | ☑ skill | Partial |
| M13 | **Voice/hear intelligence** (LUFS, pace, Resemblyzer, scene-mapped music) | ◐ | Partial |
| M14 | **Dual orchestration** (assistant + Montara orchestrator, same skills) | ◐ | Agent-only |
| M15 | **Stronger CI** (verify + validate + typecheck + pytest) | ☑ | Weaker CI |

**Moat completion bar:** M1–M2 ☑, M9 ☑, M12 ☑, M15 ☑ — **4/15 done**. Remaining moat work is Stages 3–5 below.

---

## 4. Architecture (current)

```text
user / agent / CLI
  → skills/ + AGENT_GUIDE.md
  → understand / hear / research / quality (TS + Python tools)
  → Timeline IR (@montara/core)
  → render adapter (ffmpeg default; remotion/hyperframes/… runtime-gated)
  → MP4 + self-review
  → export: EDL / OTIO / FCPXML (@montara/bridge)

Python engine (tools/, lib/) ←engine_bridge.py→ @montara/engine
```

Full matrix: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 5. Master roadmap — stages at a glance

| Stage | Name | Goal | Completion |
|-------|------|------|------------|
| **0** | Foundation & honesty | Runnable repo, gates, honest docs, CI | **100%** |
| **1** | OpenMontage parity | Same pipelines, tools, governance, offline path | **~75%** |
| **2** | Native composition | Remotion + HyperFrames as real defaults, not FFmpeg solids | **~45%** |
| **3** | Moat core | IR import, local LLM, CLI completeness, capture, craft gates | **~40%** |
| **4** | Surpass OpenMontage | README demos, agent guide parity, live providers, vision | **~15%** |
| **5** | Product surface | runtimes, web GUI, WARCUT, public launch | **~5%** |

---

## 6. STAGE 0 — Foundation & honesty 🎯 (wrap remaining ~15%)

### 0.1 Documentation & agent contract

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 0.1.1 | Honest README with status table | ☑ | [README.md](./README.md) |
| 0.1.2 | AGENT_GUIDE with Timeline IR first + runtime honesty | ☑ | [AGENT_GUIDE.md](./AGENT_GUIDE.md) |
| 0.1.3 | Add onboarding section → `skills/meta/onboarding.md` | ☑ | AGENT_GUIDE links it for vague first messages |
| 0.1.4 | Expand AGENT_GUIDE to OpenMontage depth | ☑ | Pipeline inventory, tool protocols, checkpoint detail |
| 0.1.5 | ARCHITECTURE.md runtime truth | ☑ | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| 0.1.6 | PROVIDER-AUDIT.md | ☑ | [docs/PROVIDER-AUDIT.md](./docs/PROVIDER-AUDIT.md) |
| 0.1.7 | SKILL-ROADMAP.md | ☑ | [docs/SKILL-ROADMAP.md](./docs/SKILL-ROADMAP.md) |
| 0.1.8 | PROMPT_GALLERY.md | ☑ | Expanded to match/exceed OpenMontage coverage |
| 0.1.9 | Sync MONTARA-PARITY.md with this PLAN | ☑ | Same ☑/◐/☐; correct verify/validate/pytest counts |
| 0.1.10 | Update CAPABILITY-SNAPSHOT date + Playwright row | ☑ | Reflects 2026-06-29 state |
| 0.1.11 | Remove all stale `python/` path references | ☑ | BRANDING-PROVENANCE, MONTARA_ENGINE, CLONE-PLAN, PORTING-PROVENANCE updated |

### 0.2 Legal & repo hygiene

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 0.2.1 | `LICENSE` (AGPL-3.0 full text) | ☑ | Root file |
| 0.2.2 | `NOTICE` (upstream + Montara attribution) | ☑ | Root file |
| 0.2.3 | `docs/ATTRIBUTION.md` dependency list | ☑ | Major deps and runtime/license notes |
| 0.2.4 | `.gitignore` — `out/`, `.python-packages/`, `node_modules/`, auth state | ☑ | Runtime artifacts/auth state ignored; source docs tracked |
| 0.2.5 | `montara doctor --fix` guided setup | ☑ | FFmpeg, Node, Piper, optional Playwright/Remotion hints |

### 0.3 CI & gates

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 0.3.1 | GitHub Actions: typecheck + verify + validate + pytest | ☑ | [.github/workflows/ci.yml](./.github/workflows/ci.yml) |
| 0.3.2 | Native render smoke job (continue-on-error) | ☑ | `pnpm montara -- engines` |
| 0.3.3 | Document gate counts in README | ☑ | Latest local typecheck/verify/validate/pytest snapshot |
| 0.3.4 | Pre-commit or PR template referencing gates | ☑ | `.github/pull_request_template.md` |

**Stage 0 exit criteria:** complete after `0x26` when gates are green.

---

## 7. STAGE 1 — OpenMontage parity (~75% complete)

Goal: **Every OpenMontage capability** available through Montara (Python tools and/or TS
boundary) with offline fallbacks. Track detail in [docs/MONTARA-PARITY.md](./docs/MONTARA-PARITY.md).

### 1A — Python engine & bridge

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 1A.0 | Engine at repo root (not `python/`) | ☑ | tools 116, lib 18 |
| 1A.1 | `engine_bridge.py` info + verify | ☑ | AST parse lib+tools |
| 1A.2 | Timeline bridge (composition ↔ IR) | ☑ | `@montara/engine` tests green |
| 1A.3 | CLI invokes bridge deliberately | ◐ | `montara` engine subcommands |
| 1A.4 | Wire high-value Python tools from CLI | ◐ | corpus, clip_search, video_compose, cost_tracker |
| 1A.5 | Contract tests (pytest) parity with upstream | ☑ | 34 test files |
| 1A.6 | `playwright_recorder` in registry | ☑ | Auto-discovered via pkgutil |
| 1A.7 | `playwright_recorder` pytest (mock or smoke) | ☑ | `tests/capture/test_playwright_recorder.py` |
| 1A.8 | Update `tools/capture/__init__.py` docstring | ☑ | Mentions FFmpeg, Cap, Playwright, selector |

### 1B — Pipelines (12 + Montara extras)

| ID | Pipeline | Status | Notes |
|----|----------|--------|-------|
| 1B.01 | animated-explainer | ☑ | manifest + stage skills |
| 1B.02 | animation | ☑ | |
| 1B.03 | avatar-spokesperson | ☑ | |
| 1B.04 | cinematic | ☑ | |
| 1B.05 | clip-factory | ☑ | |
| 1B.06 | documentary-montage | ◐ | CLIP corpus path needs CLI E2E validate |
| 1B.07 | hybrid | ☑ | |
| 1B.08 | localization-dub | ☑ | |
| 1B.09 | podcast-repurpose | ☑ | |
| 1B.10 | screen-demo | ◐ | Playwright path new; needs validate case |
| 1B.11 | talking-head | ☑ | |
| 1B.12 | character-animation | ☑ | |
| 1B.13 | framework-smoke | ☑ | test harness |
| 1B.14 | kinetic-typography | ☑ | promoted to `pipeline_defs/` with HyperFrames-aware stage directors |

**Task:** For each ◐ pipeline, add a `validate` case that produces a real MP4 offline.

### 1C — Providers & tools (parity categories)

| Category | Status | Remaining work |
|----------|--------|----------------|
| **C** Video providers (14 cloud + local + stock) | ◐ | Live executor audit per PROVIDER-AUDIT |
| **D** Image providers (10) | ◐ | TS + Python; OpenAI/Google defaults updated |
| **E** Audio/TTS/music | ◐ | Piper local path; mixer/enhance via FFmpeg |
| **F** Post/enhancement | ◐ | Model enhancers runtime-gated |
| **G** Analysis/understanding | ◐ | Reference analysis ☑ in verify; CLIP vision ☐ |
| **H** Intelligence (research, corpus, scoring) | ◐ | TS ports exist; Python corpus not default in CLI |
| **I** Governance (pre-compose, self-review, budget) | ◐ | quality package; budget CLI ☐ |
| **J** Styles (3) + output profiles (6) | ☑ | verify green |
| **K** Agent layer (skills, schemas, checkpoints) | ◐ | skills ☑; checkpoint resume CLI ☐ |

### 1D — Composition engines (honest registry)

| Engine | Status | Next task |
|--------|--------|-----------|
| FFmpeg | ☑ working | Keep as universal floor |
| Remotion | ◐ native smoke | Stage 2.2 — default Timeline routing |
| Revideo | ☐ runtime-gated | Implement `@montara/render-revideo` native entry |
| Motion Canvas | ☐ runtime-gated | Implement `@montara/render-motioncanvas` native entry |
| HyperFrames | ◐ native smoke | Strict kinetic smoke via `hyperframes_compose`; CLI compose integration still pending |
| three.js | ◐ | Native headless proof, not fallback only |
| Manim | ◐ | Native when `manim` installed |
| Blender | ◐ | Proof exists; document in README |
| Playwright | ◐ capture | CLI: `montara capture --url`; auth via `montara capture login` |
| Spline | ☐ planned | Defer until contract clear |

**Stage 1 exit criteria:** All 1B pipelines ◐→☑ with validate MP4; MONTARA-PARITY synced; 1A.4 CLI wiring for compose/corpus.

---

## 8. STAGE 2 — Native composition (beat OpenMontage on output quality)

OpenMontage wins today on Remotion/HyperFrames polish. Montara must match then exceed via IR.

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 2.1 | **Native Remotion render** in validate | ☑ | Real spring/caption MP4, not FFmpeg solids |
| 2.2 | Remotion as default when `REMOTION_ENABLED` + composer installed | ☐ | `recommendEngine` + `montara make` use it |
| 2.3 | **HyperFrames compose** E2E through Python `hyperframes_compose` | ☑ | validate case: kinetic typography MP4 |
| 2.4 | `make setup` equivalent: `montara doctor --fix` + HyperFrames cache-warm | ☐ | npx hyperframes doctor |
| 2.5 | Revideo MIT fallback auto-switch | ☐ | License-aware adapter selection |
| 2.6 | Motion Canvas native package | ☐ | kinetic-typography pipeline default |
| 2.7 | Documentary montage: CLIP corpus + real footage stitch | ☐ | validate: 60s stock-footage MP4, zero keys |
| 2.8 | Character animation: HyperFrames SVG rig → final MP4 | ☐ | match OpenMontage pipeline output |

**Stage 2 exit criteria:** 2.1 + 2.3 + 2.7 green in `validate`; README embeds 3 native-composition demo videos.

---

## 9. STAGE 3 — Moat core (unique advantages)

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 3.1 | Auto-export EDL+OTIO+FCPXML on every `montara render` | ◐ | Flag default on |
| 3.2 | **Editor import** `montara import <fcpxml\|otio\|edl>` → Timeline IR | ☐ | Round-trip test |
| 3.3 | **Local LLM** drives `montara make` (Ollama/LM Studio) | ☐ | Zero-cloud idea→MP4 |
| 3.4 | `montara budget` (estimate/reserve/reconcile) | ☐ | Wraps `tools/cost_tracker.py` |
| 3.5 | `montara analyze <url\|file>` reference-video CLI | ◐ | Partial via understand package |
| 3.6 | `montara capture` (Playwright + desktop selector) | ☑ | Wraps screen_capture_selector + playwright_recorder |
| 3.7 | Documentary evidence craft **gates** in quality package | ◐ | Skill ☑; automated LUFS/map/claim checks |
| 3.8 | Reel factory with transcript-verified Shorts cuts | ◐ | verify tests exist; CLI command |
| 3.9 | `montara resume <project>` from checkpoint JSON | ☐ | `lib/checkpoint.py` wired |
| 3.10 | Project workspace convention enforced | ◐ | AGENT_GUIDE documents; CLI creates dirs |
| 3.11 | SpeechBrain optional backend in `@montara/hear` | ☐ | Behind optional dep |
| 3.12 | Real CLIP/BLIP in `@montara/understand` | ☐ | Replace signalstats default |

**Stage 3 exit criteria:** 3.2, 3.3, 3.4, 3.6, 3.9 ☑; moat items M3, M4, M5, M10, M11 → ☑ or ◐ with validate.

---

## 10. STAGE 4 — Surpass OpenMontage (experience & trust)

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 4.1 | README at OpenMontage depth (demos, costs, embedded videos) | ☐ | Match or exceed upstream README |
| 4.2 | Public demo gallery (`assets/` + docs/DEMOS.md) | ☐ | Each demo: prompt, pipeline, tools, cost |
| 4.3 | AGENT_GUIDE parity + onboarding | ☑ | 0.1.3 + 0.1.4 |
| 4.4 | PROMPT_GALLERY full coverage | ☑ | 0.1.8 |
| 4.5 | Live BYOK provider executors + sanitized fixture tests | ☐ | Per PROVIDER-AUDIT follow-ups |
| 4.6 | `skills/core/native-render-validation.md` | ☐ | Per SKILL-ROADMAP |
| 4.7 | `skills/core/provider-audit.md` | ☐ | Per SKILL-ROADMAP |
| 4.8 | YouTube/community launch plan | ☐ | Optional; not blocking technical win |
| 4.9 | Compare report automation (`montara status` vs upstream) | ☐ | For future "detailed analysis" with no gaps |

**Stage 4 exit criteria:** New user reproduces 5 gallery demos without reading OpenMontage; agent-only workflow matches upstream quality.

---

## 11. STAGE 5 — Product surface (long-term moat)

| ID | Task | Status | Acceptance |
|----|------|--------|------------|
| 5.1 | `packages/runtimes` — ComfyUI/A1111 install/health | ☐ | Pinokio-style |
| 5.2 | `packages/sdk` public API | ☐ | Same as CLI capabilities |
| 5.3 | `packages/web` — `montara serve` timeline editor | ☐ | Edits IR, triggers render |
| 5.4 | WARCUT desktop GUI on IR | ☐ | Separate repo or monorepo package |
| 5.5 | Spline bridge | ☐ | After 2.x composition stable |
| 5.6 | Python-free core (phased module replacement) | ☐ | Only with parity tests per module |

**Stage 5 exit criteria:** M6, M7, M8 ☑; Montara usable without any external coding assistant.

---

## 12. Preserved TypeScript ports (do not discard)

| Commit era | Area | Role today |
|------------|------|------------|
| P0–P3 (`0x0d`–`0x10`) | tool contract, config, quality, corpus | Adapter seams + fidelity tests around Python engine |

Replace Python only when: parity tests pass, gates green, boundary improves.

---

## 13. Pipeline flow (all stages)

```text
research → plan → script → assets → edit → Timeline IR → render → QA → master → export
```

Quality hooks (from documentary evidence craft + reviewer):

- Pre-compose: slideshow-risk, delivery promise, runtime approval
- Post-render: ffprobe, 4-position frames, audio silence/clip, LUFS
- Master: one pass ~−14 LUFS / −1 dBTP for social delivery

---

## 14. Runnability guarantee

A phase is **not done** unless:

1. `pnpm typecheck` — green  
2. `pnpm verify` — green (all contract assertions)  
3. `pnpm validate` — green (real MP4 artifacts under `out/` or project workspace)  
4. `python -m pytest tests` — green when Python changed  
5. New capability has ☑ in this PLAN and MONTARA-PARITY  
6. Docs updated if user-facing behavior changed  

---

## 15. Licensing (Stage 0 blocker for public publish)

- ☑ `LICENSE` — full AGPL-3.0  
- ☑ `NOTICE` — Montara + upstream OpenMontage derivation  
- ☑ `docs/PORTING-PROVENANCE.md`  
- ☑ `docs/ATTRIBUTION.md`  

See [BRANDING-PROVENANCE-PLAN.md](./BRANDING-PROVENANCE-PLAN.md).

---

## 16. Risks (unchanged, honest)

- Native render paths are the main quality gap vs OpenMontage.
- Cloud APIs drift — PROVIDER-AUDIT must stay current.
- `runtimes` automation is hard; degrade to cloud BYOK never blocks.
- Stars/community are not guaranteed; **runnable demos + honesty** are controllable.

---

## 17. Immediate next tasks (ordered — start here)

When you say "continue the plan," work **top to bottom**:

| Priority | ID | Task | Est. |
|----------|-----|------|------|
| ✅ | 0.1.9 | Sync `docs/MONTARA-PARITY.md` with this PLAN (☑/◐/☐, counts) | done |
| ✅ | 0.2.1–0.2.2 | Add `LICENSE` + `NOTICE` | done |
| ✅ | 0.1.3 | AGENT_GUIDE onboarding section | done |
| ✅ | 1A.7 | pytest for `playwright_recorder` | done |
| ✅ | 3.6 | `montara capture` CLI wrapping Playwright tool | done |
| ✅ | 2.1 | Native Remotion validate case | done |
| ✅ | 2.3 | HyperFrames E2E validate case | done |
| ✅ | 1B.14 | Promote kinetic-typography to `pipeline_defs/` | done |
| 🎯 1 | 1A.4 | CLI wire `video_compose` + `corpus_builder` | 1d |
| 7 | 4.1 | README demo gallery | 1d |

---

## 18. Related documents

| Document | Purpose |
|----------|---------|
| [README.md](./README.md) | User-facing quick start + honest status |
| [AGENT_GUIDE.md](./AGENT_GUIDE.md) | Agent operating contract |
| [PROMPT_GALLERY.md](./PROMPT_GALLERY.md) | Copy-paste production prompts |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Runtime truth matrix |
| [docs/MONTARA-PARITY.md](./docs/MONTARA-PARITY.md) | Parity checklist (sync with §7) |
| [docs/PROVIDER-AUDIT.md](./docs/PROVIDER-AUDIT.md) | BYOK live executor notes |
| [docs/SKILL-ROADMAP.md](./docs/SKILL-ROADMAP.md) | Layer 2/3 skill absorption plan |
| [docs/CAPABILITY-SNAPSHOT.md](./docs/CAPABILITY-SNAPSHOT.md) | Point-in-time capability photo |
| [docs/PORTING-PROVENANCE.md](./docs/PORTING-PROVENANCE.md) | Legal derivation record |
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | Architecture conventions |

---

## 19. How to use this plan for "detailed analysis"

When asked for a gap analysis:

1. Read **§5 Master roadmap** for stage completion %.  
2. Read **§6–§11** for item-level ☑/◐/☐.  
3. Run gates locally; compare counts to §Snapshot.  
4. Compare **§ Competitive score** to OpenMontage.  
5. Report **§17 Immediate next tasks** as the backlog head.  

No analysis is complete without running `pnpm verify` and `pnpm validate` on the
machine under test.

---

*Montara wins when Stages 0–2 close the OpenMontage gap, Stage 3 ships the moat, and Stages 4–5 make it the default choice for local-first, IR-native, editor-bridge video production.*
