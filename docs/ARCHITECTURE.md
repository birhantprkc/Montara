# Montara Architecture And Runtime Truth

Montara is a Timeline IR system with runtime adapters, tool contracts, and
skills around it. This document is intentionally candid: it separates shipped
capabilities from adapter surfaces and planned work so agents do not overpromise.

## Core Shape

```text
user intent / source media
  -> research + understand + hear
  -> plan / script / edit decisions
  -> Timeline IR
  -> render adapter
  -> MP4
  -> QA / master
  -> EDL / OTIO / FCPXML exports
```

The Timeline IR is the only canonical video representation. `scene_plan`,
`edit_decisions`, transcripts, music cue sheets, reference analyses, and runtime
workspace files are supporting artifacts.

## Major Areas

| Area | Shipped center | Notes |
| --- | --- | --- |
| Core model | `packages/core` | Pure TypeScript Timeline IR, clips, tracks, composition, transforms, keyframes, transitions. |
| FFmpeg render | `packages/render-ffmpeg` | Universal MP4 path and fallback. Owns many real media operations. |
| Runtime adapters | `packages/render-*` | External processes or browser/runtime bridges. Must be validated per machine. |
| Providers | `packages/providers` and `tools/*` | BYOK request builders plus Python tools. Offline fallbacks remain mandatory. |
| Python tools | `tools/` | Real operational muscle: capture, analysis, generation, enhancement, registry. |
| Skills | `skills/` and `.agents/skills/` | Layer 2 Montara guidance plus Layer 3 provider/runtime knowledge. |
| CLI | `packages/cli` | User-facing entry point for doctor/status/stage1-audit/plan/make/render/hear/understand/export flows. |
| Exports | `packages/export-*` | Editor interchange path for EDL, OTIO, and FCPXML. |
| QA | `packages/quality` and tools | Playback, audio, craft, and validation gates. |

`montara render <timeline-or-scene-plan.json> [out.mp4]` now treats editor
handoff as part of rendering: it writes the MP4 and, unless explicitly disabled,
creates `.edl`, `.otio`, and `.fcpxml` siblings from the same Timeline IR. The
explicit `montara export --to ...` command remains available for one-off format
exports.

## Renderer Status

| Renderer | Current status | Validation rule |
| --- | --- | --- |
| FFmpeg | Working and reliable for local MP4 output. | Always acceptable fallback if the creative promise allows it. |
| Remotion | Native smoke render is validate-gated when `remotion-composer` deps are installed; full Timeline routing is not guaranteed on every machine. | Require the native Remotion validate case before promising it as final engine. |
| Revideo | Runtime-gated adapter plus license-aware open fallback selection for Remotion-style composition choices. | Require installed Revideo toolchain and MP4 probe before promising native output. |
| Three.js | Registered and partially implemented through browser/WebGL rendering. | Run headless browser/canvas checks before promising 3D output. |
| Manim | Real external Manim path when installed. | Verify generated video and transcode. |
| Blender | Real headless Blender path when installed. | Verify render and final MP4. |
| Motion Canvas | Adapter/runtime-gated; picker target for kinetic typography. | Confirm Node toolchain and native render before promising output. |
| Spline | Planned. | Needs a render package, selector registration, and validate case. |
| Playwright | Browser recording/capture path, not a general render engine. | Validate login state, recording, transcode, and privacy review. |
| HyperFrames | Python `hyperframes_compose` can strict-lint/validate/render a kinetic typography MP4 and character SVG-rig final MP4 when `npx hyperframes` is available; broader pipeline parity is incomplete. | Treat as runtime-gated and require the Stage 2.3/2.8 validate cases before promising it. |

## Understanding Status

Current local understanding is useful, with model vision available only when the
local runtime is explicitly installed and enabled:

- real by default: FFmpeg probes, frame extraction, scene/signal statistics,
  audio pacing, loudness, basic visual variety;
- partial: transcript/Whisper paths where installed;
- optional: Transformers.js CLIP frame classification through
  `montara understand --vision auto|require` when `@huggingface/transformers`
  or `@xenova/transformers` is installed and model downloads are allowed;
- planned/hardening: cached-weight validation, BLIP/image-to-text captions, and
  video-language semantic retrieval as a default local path.

Agents must not describe signalstats-only output as "real CLIP/BLIP vision."
Only claim CLIP when the understanding JSON reports `mode: "vision-models"`.

## Reel Generator Direction

The reel path should be content-aware:

1. Inspect source video/audio/images first.
2. Extract transcript timing, pacing, emotion, scene changes, and source-media roles.
3. Read the user prompt and classify the input: talking head, gameplay, photos,
   documentary source, screen capture, pure prompt, product footage, etc.
4. Select a style because it helps the subject, not because a template is hardcoded.
5. Emit Timeline IR and editable decisions.

Examples:

- Fable/game-design brief: mechanic diagrams, UI/progression mockups, world-system
  overlays, comparison frames, and readable captions.
- Talking head: preserve face/voice; add overlays only where they clarify.
- Documentary: source-backed maps, evidence cards, measured narration, scene-mapped music.
- Minimal: restrained typography, fewer overlays, no generic CTA.

The Stage 3 gate helpers make this executable: `documentaryEvidenceGate` blocks
source-backed claims without URLs and precise maps without source data, while
`suggestTranscriptShortCuts` and `verifyShortCutsAgainstTranscript` keep Shorts
cut points on transcript boundaries instead of guessed timestamps.

## Provider Audit Policy

Cloud providers change faster than Montara releases. Provider code must be checked
against official docs before live execution. Current audit anchors:

- OpenAI image generation and audio speech API docs.
- Google Gemini API docs for image generation / Veo, including header-based
  `x-goog-api-key` flows.
- Runway API docs for current task endpoints and version headers.
- Black Forest Labs API docs.
- ElevenLabs TTS, music, and sound generation docs.

The registry may contain request builders that are correct enough for offline
contract tests but still require a live executor audit before spending user money.

## Python Engine Muscle

Montara keeps the Python tool layer because video production needs OS/process
integration: FFmpeg, capture, model runners, image/audio tooling, and registry
discovery. The rule is:

- TypeScript core stays pure and typed.
- Python tools expose capability contracts and artifacts.
- Agents read skills before using tools.
- Every new tool needs dependency reporting, fallback behavior, and a validation path.

## Documentary Corpus Path

The documentary-montage path has two validated corpus modes:

- `montara corpus seed-fixture`: tiny no-key fixture proof for fast smoke tests.
- `montara corpus seed-open-stock-proof`: deterministic 12-slot, 60-second
  provenance-aware proof. It writes `open-stock-proof.slots.json`, then
  `clip_search.select_slots` selects one non-reused row per slot before
  `montara compose` assembles the MP4.

For publication footage, agents should replace the surrogate seed clips with a
live `montara corpus build` run against open sources such as Archive.org,
Wikimedia, NASA, NOAA, NARA, LOC, ESA, Mixkit/Coverr-style sources, or keyed
Pexels/Pixabay when available. Keep per-file `source_url`, license, creator,
selection trace, and asset manifest rows; do not collapse everything into an
unattributed "stock" bucket.

## Screen Capture And Auth

Desktop app trailers use free local capture:

- `screen_recorder` through FFmpeg for desktop/full-screen capture.
- `cap_recorder` for user-driven polished recordings.

Website trailers use Playwright:

- `interactive_login` opens a browser so the user can log in.
- The tool saves `storageState` under a gitignored project path.
- `record` reuses that state and transcodes Playwright WebM to MP4 with FFmpeg.

Montara does not yet ship arbitrary free desktop UI automation. It records
desktop apps; it does not autonomously operate every desktop app.

## CI Contract

CI should run:

- TypeScript typecheck;
- `pnpm verify`;
- `pnpm validate`;
- Python dependency install from `requirements/dev.txt`;
- `python -m pytest tests`.

Runtime-heavy native render checks should be split into optional jobs or
validate cases that skip with an explicit missing-dependency reason.
