# Montara

Montara is an open, local-first video production system built around one editable
Timeline IR. Agents, humans, CLIs, and future GUIs all work on the same JSON
timeline, then render it to a real MP4 and, when needed, export it to editor
formats such as EDL, OTIO, and FCPXML.

Montara's advantage is not a single renderer. It is the combination of:

- a strongly typed Timeline IR as the source of truth;
- a Python tool registry for real-world media work and provider discovery;
- local-first fallbacks that still produce watchable MP4s without API keys;
- skill-guided agents that inspect sources before composing;
- export bridges for professional editor handoff.

## Current State

This repository is runnable, but not every premium runtime is equally mature.
Montara should be honest with users and agents:

| Area | Status |
| --- | --- |
| Timeline IR | Real core model and render/export surface. This is the canonical format. |
| FFmpeg render | Working universal fallback for assembly, encode, captions, audio, and MP4 output. |
| Blender / Manim | Real external-process adapters when the corresponding tools are installed. |
| Three.js | Registered and partially implemented through a headless browser path; still runtime-gated. |
| Revideo / Motion Canvas | Adapter surfaces exist and depend on the local toolchain. Validate before promising native output. |
| Remotion | Native smoke render is validate-gated when `remotion-composer` deps are installed; full Timeline default routing is still being hardened. |
| HyperFrames | Native strict kinetic-typography smoke render is validate-gated when `npx hyperframes` is available; broader pipeline parity is still in progress. |
| Video understanding | Current local path is FFmpeg/scene/audio signal analysis. Real CLIP/BLIP-style vision is a planned upgrade, not a shipped guarantee. |
| Local LLM orchestration | The architecture supports local brains, but a fully shipped local orchestration loop is still being hardened. |
| Screen recording | FFmpeg desktop capture, Cap pickup, and `montara capture` Playwright browser recording with user-login storageState. |
| Cloud providers | Request builders exist for BYOK use. Keep them audited against official provider docs before live execution. |

For the detailed matrix, read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and
[docs/MONTARA-PARITY.md](./docs/MONTARA-PARITY.md).

## Quick Start

```bash
montara doctor
montara plan "Make a 45-second explainer about why the sky is blue"
montara make "Make a 45-second explainer about why the sky is blue"
montara render out/timeline.json
montara export out/timeline.json --to otio out/edit.otio
montara capture --url https://example.com out/browser-capture.mp4
montara compose out/edit-decisions.json out/final.mp4 --assets out/asset-manifest.json
montara corpus sources
```

If the CLI is not linked globally, use `npm.cmd run montara -- <command>` on
Windows or `npm run montara -- <command>` on macOS/Linux.

## Demo Gallery

Run this once to generate the zero-key local proof set:

```bash
npm.cmd run validate
```

The validate harness writes real local artifacts under `out/`. These are the
current reproducible demos to inspect before trusting a workflow:

| Demo | Command | Output | Pipeline / runtime | Cost |
| --- | --- | --- | --- | --- |
| Timeline IR explainer | `npm.cmd run validate` | `out/validate-compose-core.mp4` + `out/validate-compose-core.timeline.json` | ScenePlan -> Timeline IR -> FFmpeg MP4 | `$0` |
| Native Remotion smoke | `npm.cmd run validate` | `out/validate-remotion-native.mp4` when deps are installed | Remotion native spring/caption proof, otherwise honest skip | `$0` |
| Python compose CLI | `npm.cmd run validate` | `out/validate-cli-video-compose.mp4` + `.render-report.json` | `montara compose` -> Python `video_compose` -> FFmpeg | `$0` |
| Smart reel proof | `npm.cmd run validate` | `out/validate-smart-reel.mp4` | Source-aware reel planner + caption/end-card treatment | `$0` |
| Editor handoff | `npm.cmd run montara -- export out/validate-compose-core.timeline.json --to otio out/validate-compose-core.otio` | OTIO/EDL/FCPXML files on demand | One Timeline IR -> editor bridge | `$0` |
| Corpus/source discovery | `npm.cmd run montara -- corpus sources` | source-provider menu in stdout | Python `corpus_builder` discovery, no download required | `$0` |
| Auth browser capture | `npm.cmd run montara -- capture login --url https://example.com` then `capture --url ...` | `out/browser-capture.mp4` | Playwright recording with user-owned storageState | `$0`, runtime-gated |

For the public proof ledger, see [docs/DEMOS.md](./docs/DEMOS.md). For richer
prompt coverage, see [PROMPT_GALLERY.md](./PROMPT_GALLERY.md). The gallery
covers talking-head overlays, documentary evidence cuts, kinetic typography,
browser demos behind login, editor handoff, and style-switch prompts.

For repository work:

```bash
pnpm verify
pnpm validate
pnpm typecheck
python -m pytest tests
```

Latest local gate snapshot from the Stage 4.5B.1 Python provider request-shape audit:

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run verify` | 284 passed, 0 failed |
| `npm.cmd run validate` | 81 passed, 0 failed |
| `python -m pytest tests` | 375 passed, 9 skipped |

## Agent Entry Points

- [AGENT_GUIDE.md](./AGENT_GUIDE.md) is the assistant-agnostic operating contract.
- [skills/INDEX.md](./skills/INDEX.md) is the skill map.
- [docs/DEMOS.md](./docs/DEMOS.md) is the checked-in demo gallery and artifact ledger.
- [docs/PROVIDER-AUDIT.md](./docs/PROVIDER-AUDIT.md) records current cloud-provider request shapes and live-audit gaps.
- [PROMPT_GALLERY.md](./PROMPT_GALLERY.md) contains prompts that exercise the real system without overclaiming runtimes.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) explains what is solid, adapter-backed, or planned.

Agents should run the same loop every time: inspect sources, read the relevant
skills, produce or update the Timeline IR, render, QA the MP4, and export editor
formats when requested.

## License

Montara is AGPL-3.0 and open by design. Do not commit secrets, generated private
media, or third-party model weights.
