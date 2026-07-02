# Montara Porting Provenance

This file records the provenance boundary for Montara. It is intentionally a legal/provenance
surface, so it may name upstream works that normal product-facing code, prompts, docs, and runtime
artifacts should not mention.

## Source Project

Reference checkout: `C:\OpenMontage` (`calesthio/OpenMontage`, AGPL-3.0).

Montara includes derived code and ideas from that source project. Required notices stay in
`NOTICE`, `LICENSE`, and this provenance file. Product-facing Montara surfaces should use Montara
branding unless they are explicitly giving legal attribution.

## Current Strategy

The earlier TypeScript-first rewrite plan is paused. The active strategy is:

1. Keep the runnable Python engine at the **repo root** (polyglot: Python engine + TS boundary side
   by side; there is no longer a `python/` subfolder).
2. Wrap it with Montara Timeline IR, CLI/SDK, adapters, and verification gates via a dependency-free
   process bridge (`engine_bridge.py` <-> `@montara/engine`).
3. Treat the engine as the fidelity oracle until a stronger verified replacement exists for a
   specific boundary.
4. Replace Python modules only when focused parity tests prove the replacement.

## New Montara Work

All new code written after the 2026-06-27 Python-engine pivot is Montara / Warfront AI authored
work unless a file explicitly states another source. This applies to new adapters, bridge logic,
tests, CLI behavior, product copy, schemas, and verification gates.

This rule does not relabel copied or derived source-project code. Derived files retain provenance
through this file and `NOTICE`.

## Imported Engine Areas (now at repo root)

- `lib/` - config, delivery, scoring, retrieval, checkpoint, media, prompt/style helpers.
- `tools/` - analysis, audio, video, graphics, enhancement, avatar, capture, character,
  subtitle, and registry tooling (115 modules).
- `skills/` - pipeline, creative, core, and meta instruction layers (189).
- `pipeline_defs/` - pipeline manifests (14).
- `schemas/` - artifact, checkpoint, pipeline, style, and tool schemas (27).
- `remotion-composer/` - React composition project.
- `tests/` - contract, QA, style, tool, and evaluation tests (29).

Generated/private/runtime artifacts were excluded from the import: VCS history, virtualenvs,
caches, local outputs, corpora, secrets, token files, model weights, and generated media.

## Stage 1A — Engine Bridge (Montara/Warfront authored)

The TypeScript boundary that drives the engine. New authored work, not derived source:

| Commit | Phase | Deliverable |
|---|---|---|
| `0x12` | 1A.0 | Engine mirror moved to root (polyglot), `.gitignore`/LICENSE compliance, real MP4 proof |
| `0x13` | 1A.1 | `engine_bridge.py` + `@montara/engine` process bridge; `montara doctor`/`engine` readiness |
| `0x14` | 1A.2 | Timeline-IR bridge (engine `cuts` <-> Montara Timeline IR; no parallel format) |
| `0x15` | 1A.3 | Render bridge (engine Remotion composer + ffmpeg fallback; validate renders a real MP4) |
| `0x16` | 1A.4 | Provider/runtime discovery (dependency-free, secret-safe, no-key path never crashes) |
| `0x17` | 1A.5 | Engine self-check battery (schemas/compositions/skills/tests/pipelines) in the gate |
| `0x18` | 1A.6 | Enforced compliance gate (no legacy branding, no hardcoded secrets in source) |
| `0x55` | 1A-D | Stage 1 parity audit CLI: bridge, pipelines, providers, and engine-registry evidence |
| `0x56` | 2.4/2.5/2.8 | Stage 2 runtime gap pass: HyperFrames doctor/cache-warm, license-aware Revideo fallback, character SVG rig final MP4 validate proof |
| `0x57` | 3.3/3.5/3.7/3.8/3.10 | Stage 3 moat pass: local-brain fallback make, URL reference preflight, documentary evidence gates, transcript Shorts gates, project workspace CLI |

## Preserved TypeScript Work

The existing P0-P3 TypeScript ports remain useful as typed contracts and adapter seams:

| Commit | Area | Role now |
|---|---|---|
| `0x0d` | tool contract + TTS contract test | provider contract and fidelity harness |
| `0x0e` | config + delivery | config/delivery boundary |
| `0x0f` | scoring + risk + media review helpers | quality/governance boundary |
| `0x10` | corpus + checkpoint + prompt/style helpers | retrieval/checkpoint boundary |

## Verification

After branding or bridge work:

```powershell
pnpm verify
pnpm validate
```

For Python-only changes, run a no-bytecode AST parse from the repository root,
excluding caches and generated output directories.
