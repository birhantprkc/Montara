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
montara export out/timeline.json --to otio
montara capture --url https://example.com out/browser-capture.mp4
montara compose out/edit-decisions.json out/final.mp4 --assets out/asset-manifest.json
montara corpus sources
```

For repository work:

```bash
pnpm verify
pnpm validate
pnpm typecheck
python -m pytest tests
```

Latest local gate snapshot from the Stage 2.3 sync:

| Gate | Result |
| --- | --- |
| `npm.cmd run typecheck` | passed |
| `npm.cmd run verify` | 272 passed, 0 failed |
| `npm.cmd run validate` | 79 passed, 0 failed |
| `python -m pytest tests` | 365 passed, 8 skipped |

## Agent Entry Points

- [AGENT_GUIDE.md](./AGENT_GUIDE.md) is the assistant-agnostic operating contract.
- [skills/INDEX.md](./skills/INDEX.md) is the skill map.
- [PROMPT_GALLERY.md](./PROMPT_GALLERY.md) contains prompts that exercise the real system without overclaiming runtimes.
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) explains what is solid, adapter-backed, or planned.

Agents should run the same loop every time: inspect sources, read the relevant
skills, produce or update the Timeline IR, render, QA the MP4, and export editor
formats when requested.

## License

Montara is AGPL-3.0 and open by design. Do not commit secrets, generated private
media, or third-party model weights.
