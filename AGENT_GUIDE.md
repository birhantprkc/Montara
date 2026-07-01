# Montara Agent Guide

This is the operating contract for any assistant driving Montara: Codex,
Claude Code, Cursor, Windsurf, Copilot, a local model, or Montara's own
orchestrator. There is no MCP server to call. Read the files, run the CLI,
produce a Timeline IR, render a real MP4, and verify it before you say done.

## First Interaction: Onboarding

When the user's first message is vague, exploratory, or asks what Montara can do
("make me a video", "what can you do?", "help me create content"), read
`skills/meta/onboarding.md` before choosing a pipeline.

The onboarding skill teaches the agent to run provider discovery, classify the
setup tier, present capabilities in plain language, and offer starter prompts
that are actually achievable on the current machine.

Skip onboarding when the user gives a concrete production request such as
"Make a 60-second explainer about black holes" or "Edit this talking-head clip
into three Shorts." In that case, go directly to Rule Zero, source review,
preflight, and the relevant pipeline skills.

## Rule Zero: Timeline IR First

Montara has one canonical video format: the Timeline IR from `@montara/core`.
Scene plans, edit decisions, scripts, source analysis, and runtime-specific
files are useful artifacts, but they must resolve back into the Timeline IR.

Every production request follows this loop:

```text
prompt/source -> understand -> plan -> script/edit -> Timeline IR -> render -> QA -> export
```

Never invent a private side format as the final source of truth.

## First Minute

1. Run `montara doctor` or the closest available preflight.
2. Read `skills/INDEX.md`, then the relevant pipeline/core/meta skill.
3. If the user supplied media, inspect it before planning.
4. Present the real provider/runtime options before consequential work.
5. Render a real MP4 and verify it exists.
6. For code changes, run `pnpm verify`, `pnpm validate`, `pnpm typecheck`, and
   `python -m pytest tests` when Python behavior changed.

## Source Media Rule

If the user gives a video, audio file, image set, screen recording, or reference
URL, do not trust the prompt or filename alone. Use the available understanding
path first:

- `montara understand <video>` for frame/scene/audio-signal analysis.
- `montara hear <audio>` for loudness, pace, energy, and voice/music cues.
- scene detection, transcript timing, source review, and frame sampling when available.
- `skills/meta/video-reference-analyst.md` for "make something like this" requests.

Distinguish carefully:

- Reference video: analyze style, pacing, structure, and why it works; then
  propose 2-3 differentiated directions.
- Source footage: preserve the user's footage, find the story inside it, then
  build overlays, cuts, captions, music, and support visuals around what is
  actually there.

## Pipeline Contract

Use the pipeline system for video production. Before each stage, read the stage
director skill when one exists.

Typical stages:

```text
research -> proposal -> script -> scene/assets -> edit -> compose -> render -> QA -> master
```

At minimum, each run should leave behind:

- a short decision log;
- the Timeline IR JSON;
- the final MP4;
- QA notes;
- editor exports when requested, and by default after `montara render`: EDL,
  OTIO, and FCPXML.

## Pipeline Inventory

Use this inventory when matching a user request to a production path. The
pipeline name is the contract; style words like "cinematic" or "minimal" still
need a pipeline underneath.

| Pipeline | Best for | First skills to read |
| --- | --- | --- |
| `animated-explainer` | Topic-to-video explainers, education, charts, diagrams | `skills/pipelines/explainer/*` |
| `animation` | Motion graphics, visual stories, non-footage animation | `skills/pipelines/animation/*` |
| `avatar-spokesperson` | Presenter/avatar-led announcements or training | `skills/pipelines/avatar-spokesperson/*` |
| `cinematic` | Trailers, teasers, mood-led edits | `skills/pipelines/cinematic/*` |
| `clip-factory` | Long source into many Shorts/Reels/clips | `skills/pipelines/clip-factory/*` |
| `documentary-montage` | Evidence-led factual montage from sources/stock | `skills/pipelines/documentary-montage/*` plus documentary evidence craft |
| `hybrid` | Source footage plus generated/support visuals | `skills/pipelines/hybrid/*` |
| `localization-dub` | Subtitles, dubs, per-locale variants | `skills/pipelines/localization-dub/*` |
| `podcast-repurpose` | Podcast highlights, audiograms, quote clips | `skills/pipelines/podcast-repurpose/*` |
| `screen-demo` | Software trailers, browser/site walkthroughs, terminal demos | `skills/pipelines/screen-demo/*` plus capture skills |
| `talking-head` | Speaker footage with smart overlays/captions | `skills/pipelines/talking-head/*` |
| `character-animation` | Rigged SVG/canvas/HyperFrames character work | `skills/pipelines/character-animation/*` |
| `kinetic-typography` | Text-led motion pieces, lyric/quote/title motion, HyperFrames-native word animation | `skills/pipelines/kinetic-typography/*` plus `skills/core/hyperframes.md` |

When no pipeline fits, choose the nearest one and log the mismatch. Do not make
an invisible ad-hoc pipeline.

For `screen-demo`, choose the capture route before editing:

- browser/SaaS: `montara capture login --url ...` when authentication is needed,
  then `montara capture record --url ... out/browser-capture.mp4`;
- native desktop or user-operated capture: ask for or create the recording, then
  use `montara capture pick-latest --recordings-dir <dir> --output out/screen-capture.mp4`;
- only compose the screen-demo after the picked/recorded MP4 exists and has been
  probed.

For `documentary-montage`, build or seed a corpus before selecting shots:

- quick smoke: `montara corpus seed-fixture <corpus-dir> <clip...>`;
- 60-second no-key proof: `montara corpus seed-open-stock-proof <corpus-dir> <clip...>`;
- publication run: `montara corpus build <corpus-dir> "<query>" --source archive_org --source wikimedia --source nasa ...`;
- slot selection: `montara corpus select-slots <corpus-dir> <slots.json> --kind video`.

The selection artifact must show one primary clip per slot, accumulated
exclusions, provider/source rows, license/source URL, and any rejected picks.
Use the proof seed only as a deterministic validate path; live open-stock
footage must keep per-file provenance from the source adapter.

## Stage Artifact Contract

Each stage has a concrete artifact. If a stage cannot produce its artifact, do
not move on silently.

| Stage | Artifact | Minimum contents |
| --- | --- | --- |
| research/source review | `research_brief` or `source_review` | source facts, risks, useful visuals, unanswered questions |
| proposal | `proposal_packet` | 2-3 concepts, runtime/provider shortlist, cost/auth notes |
| script | `script` / `timed_script` | narration, captions, beat timing, tone |
| assets | `asset_manifest` | source/generated media, provenance, rights notes |
| edit | `edit_decisions` | cuts, overlays, music cues, runtime, decision log |
| compose | Timeline IR | valid `@montara/core` timeline |
| render | MP4 | real file, probed by FFmpeg/ffprobe |
| QA/master | review report | duration, streams, loudness, frame checks, issues |
| export | EDL/OTIO/FCPXML | editor handoff files when requested |

The Timeline IR is the final editable truth. Scene plans and edit decisions are
valuable because they explain the IR, not because they replace it.

## Stage Director Discipline

Before doing stage work, read the stage director skill. It will often contain
constraints that are more important than generic video advice:

- allowed runtimes;
- human checkpoints;
- required source analysis;
- caption/crop rules;
- provider constraints;
- QA checks;
- artifact schema expectations.

If a director skill conflicts with the current runtime truth in
`docs/ARCHITECTURE.md`, follow the runtime truth and log the conflict as a
cleanup task.

## Decision Log

Every meaningful decision should be recoverable later. Record:

- category, such as `render_runtime_selection`, `provider_selection`,
  `source_substitution`, `fallback`, `voice_direction`, `style_direction`;
- options considered;
- selected option;
- rejected reasons;
- confidence;
- cost/auth impact;
- whether user approval was required and received.

This is especially important when degrading from a native runtime to FFmpeg. A
fallback can be correct; an invisible fallback is a bug.

## Provider Preflight

Before paid, networked, or runtime-specific work, inspect the tool/provider
registry and explain the shortlist in plain language. Do not paste raw registry
JSON into chat.

Use `provider_menu_summary()` as the primary preflight helper. It is the
human-readable rollup; `support_envelope()` is a raw firehose for debugging.

For each serious option, state:

- exact tool/provider/runtime;
- whether it is local, API, or hybrid;
- what it is best at for this brief;
- the tradeoff or missing dependency;
- cost/auth implications;
- the recommended path.

If the selected path fails, stop and report what failed, why, and the options
next. Do not silently swap to a different provider, renderer, model family, or
still-image substitute when that changes the creative promise.

## Tool Protocols

### Python Tool Registry

Python tools are discoverable through `tools.tool_registry`. Prefer selectors
when they exist, because they encode fallback logic:

- source/capture: `screen_capture_selector`;
- speech/TTS: selector tools before provider tools;
- image/video generation: provider selectors before direct providers;
- post/enhancement: runtime-gated tools with explicit fallback notes.

Before calling a tool, inspect its contract:

- capability;
- provider;
- status;
- dependencies;
- `agent_skills`;
- side effects;
- artifact schema;
- user-visible verification.

### Layer 3 Skills

If a tool declares `agent_skills`, read those skills first. Examples:

- Playwright recorder -> `.agents/skills/playwright-recording/`;
- HyperFrames compose -> `hyperframes`, `hyperframes-cli`, `gsap-*`;
- Three.js scenes -> relevant `threejs-*` skills;
- Manim -> `manim-composer` and Manim best practices;
- music and SFX -> `music`, `sound-effects`, `acestep`;
- video understanding -> `video-understand`, `ffmpeg`, `speech-to-text`.

### Cloud Providers

Before live BYOK calls, check `docs/PROVIDER-AUDIT.md` and official provider
docs. Request builders passing offline tests do not prove the provider is ready
to spend money. For live executors, capture sanitized fixtures and never log
secrets.

### Generated Assets

Every generated asset needs provenance:

- provider/tool;
- prompt or source query;
- seed/model when available;
- cost estimate;
- license/rights notes;
- where it appears in the Timeline IR.

Assets without provenance should not be treated as production-ready.

## Present Both Composition Runtimes (HARD RULE)

Hard rule: when multiple composition runtimes are available for the brief, do
not silently pick one. Present the shortlist, explain why each fits or does not
fit this specific delivery promise, recommend one, and wait for approval before
locking `render_runtime`.

The decision log must include options considered, rejected reasons, confidence,
and the final selected runtime. If only one runtime is actually installed, say
that plainly and record the unavailable options as unavailable.

## Orchestrator

The active assistant is the orchestrator when Montara's own orchestrator is not
running. It must load the relevant skills, call CLI/tools, update artifacts, and
keep the Timeline IR as the handoff between stages.

The orchestrator owns:

- selecting the pipeline;
- running provider preflight;
- creating the project workspace;
- sequencing stages;
- recording decisions;
- verifying the final MP4 and exports.

## Stage Agents

Stage agents are conceptual roles, not separate processes unless the user starts
one. For each stage, read the matching director skill and produce the expected
artifact before moving on:

- research/source review;
- proposal/runtime/provider selection;
- script/transcript/caption plan;
- assets and source pulls;
- edit decisions;
- Timeline IR composition;
- render, QA, master, and export.

## Reviewer Protocol

Review after every consequential stage and after the final render. Use
`skills/meta/reviewer.md` when available.

Reviewers look for:

- broken delivery promises;
- unsupported factual claims;
- slideshow/static-output risk;
- unreadable text;
- missing source review;
- runtime/provider swaps with no decision log;
- missing QA or missing real MP4.

## Communication Protocol

Before paid calls, runtime switches, source substitutions, or major creative
changes, state the decision and wait when approval is required. A good update
names the tool/runtime, the reason, the cost/auth implication, and the fallback.

When blocked, report:

- what was attempted;
- what failed;
- whether the issue is auth, dependency, provider behavior, code, or creative
  quality;
- the options next;
- the recommended option.

## Human Checkpoint Protocol

Pause for the user when a skill, pipeline, or risk level marks a checkpoint.
Common checkpoints:

- final concept/runtime choice;
- paid provider spend;
- reference-video interpretation;
- voice/style direction;
- use of authenticated browser recordings;
- major fallback or scope change;
- final publishing/export review.

## Runtime Honesty

The render stack is mixed maturity. Promise only what the machine can prove.

| Runtime | Agent stance |
| --- | --- |
| FFmpeg | Reliable fallback. Good for assembly, trims, captions, audio, mastering, and simple composites. |
| Remotion | Native smoke and Timeline IR rendering are validate-gated when `remotion-composer` deps are installed. Set `REMOTION_ENABLED=1` for `montara make/render` to prefer native Remotion; otherwise FFmpeg fallback is explicit. |
| Revideo | Use when the local Revideo toolchain is installed and a validate case passes. |
| Three.js | Use for WebGL/3D only after headless browser/asset checks pass. |
| Manim | Use for math/science animation when Manim is installed; verify the generated MP4. |
| Blender | Use for pro 3D when Blender is installed; verify the render and transcode. |
| Motion Canvas | Adapter/runtime-gated. Confirm the toolchain before committing. |
| Spline | Treat as planned until a Montara render package and validate case exist. |
| HyperFrames | Strict kinetic smoke renders through Python `hyperframes_compose` when `npx hyperframes` is available. Kinetic typography now has a first-class pipeline; broader non-kinetic pipeline parity remains runtime-gated. |
| Playwright | Browser capture/automation, including auth-state login. Not native desktop automation. |

For brief-driven animation choices, read `skills/meta/animation-runtime-selector.md`.

## Runtime Selection Details

Use the user's delivery promise to choose the runtime:

- If the piece is mostly trims, captions, audio, and simple overlays, FFmpeg is
  often the right choice.
- If it needs React scene components, word-level caption burn, or existing
  Remotion compositions, use the native Remotion path only when the local smoke
  validation passes; otherwise keep the FFmpeg fallback honest.
- If it is HTML/GSAP-native, kinetic typography, website-to-video, or registry
  block driven, consider HyperFrames and validate its CLI.
- If it is math/science, Manim is the natural runtime.
- If it is 3D and procedural/web-style, Three.js is appropriate.
- If it is pro 3D, Blender is appropriate.
- If it is browser capture, use Playwright as capture input, then compose the
  recording through the Timeline IR.

The output can combine runtimes. A Blender hero shot, Playwright capture, Manim
diagram, and FFmpeg final assembly can all live in one Timeline IR.

## Screen And Website Recording

Montara has three free/local recording routes:

- `screen_recorder`: FFmpeg desktop capture for native apps and full-screen demos.
- `cap_recorder`: picks up polished Cap recordings when the user records through Cap.
- `playwright_recorder`: records browser flows and can save/reuse Playwright
  `storageState` after the user logs in interactively.

For websites behind auth:

1. Run `montara capture login --url <url> --auth-state projects/<name>/auth/playwright-auth.json`.
2. Let the user log in in the opened browser.
3. Save `auth_state_path` under a gitignored project directory.
4. Reuse that state with `montara capture --url <url> out/capture.mp4 --auth-state <path>`.
5. Review the video for private data before publishing.

For native desktop apps, use FFmpeg/Cap for capture. Montara does not yet ship a
free OS-level "computer use" automation layer for arbitrary desktop UI control;
screen capture is real, app driving is a future capability.

## Reference Video Workflow

When a user says "make something like this," treat the video as a reference, not
as generic inspiration.

1. Read `skills/meta/video-reference-analyst.md`.
2. Download or inspect the reference if allowed.
3. Analyze structure, pacing, camera/motion, captions, music, visual grammar, and hook.
4. Identify what should be adapted and what must not be copied.
5. Present 2-3 differentiated concepts for the user's version.
6. Only then choose the pipeline/runtime.

Do not produce a carbon copy. Reference analysis should create a grounded brief,
not a plagiarism engine.

## Source Footage Workflow

When the user supplies footage to edit, preserve it as the source of truth:

1. Probe media duration, streams, dimensions, fps, and audio.
2. Extract representative frames or scenes.
3. Transcribe when speech matters.
4. Identify the strongest moments, dead zones, and visual gaps.
5. Decide whether overlays, diagrams, B-roll, captions, or silence improve comprehension.
6. Build the Timeline IR from the footage and support assets.

Talking-head footage should not get the same treatment as a fully generated
explainer. Keep the person visible unless the edit reason is clear.

## Layer 3 Skills

Tools can declare `agent_skills`. Before using such a tool, read the referenced
skill under `.agents/skills/`. These skills contain provider-specific prompting,
quality gates, CLI rules, and failure modes. This is mandatory for GSAP,
HyperFrames, Remotion, Three.js, Manim, video generation, TTS, music, and
screen-recording workflows.

Good Montara agents do not hand-roll what a skill already teaches.

## Montara Documentary Evidence Craft

For factual, geopolitical, documentary, educational, and data-led work, read
`skills/meta/documentary-evidence-craft.md` alongside `skills/meta/craft.md`.
This is the generalized Montara craft method formerly described as
"Warfront-style": measured voice, scene-mapped music, honest maps, source-backed
claims, moving cold opens, transcript-verified Shorts, and full-playback QA.

Do not make it brand-specific. Do not hardcode CTAs, colors, timings, or one
visual language. The prompt, source material, and Timeline IR directives should
drive the treatment.

## Reel And Shorts Rule

A reel generator must watch and understand before it stylizes. For example, a
prompt like "Make a reel explaining Fable 5 design using this talking-head
footage" should produce helpful game-design overlays: progression diagrams, UI
mockups, world-system graphics, comparison callouts, or mechanic visualizations.
It should not blindly apply generic cards or a fixed hook/end timing.

Talking-head footage gets overlays only when they aid comprehension. Cinematic,
minimal, documentary, and kinetic typography requests should produce different
Timeline IR decisions.

## Project Workspace

Use a gitignored project directory for generated media:

```text
projects/<project-name>/
  artifacts/       # analysis, scripts, decisions, Timeline IR
  assets/          # images, video, audio, music, captions
  auth/            # Playwright storageState or other local auth artifacts
  renders/         # final MP4 and review renders
  exports/         # EDL, OTIO, FCPXML
```

Do not write production artifacts to the repository root unless an existing CLI
command does so by convention.

## Checkpoint Protocol

Long runs should be resumable. Use checkpoint artifacts for:

- stage completion;
- decision log refs;
- human approvals;
- generated artifacts;
- final render paths;
- unresolved blockers.

If a run stops, resume from the next unfinished stage instead of starting over.
When implementing CLI behavior, `montara resume <project>` is the target shape.

## Budget And Cost Protocol

Local/free is the default. Before any paid action:

- estimate cost;
- state provider/model;
- state whether it is a sample or full batch;
- reserve budget when tooling supports it;
- reconcile actual spend afterward.

If a paid path is blocked, do not spend on a different provider without
approval. A local designed substitute is acceptable only if it preserves the
delivery promise or the user approves the downgrade.

## Quality Gates

Before reporting success:

- MP4 exists and `ffprobe` can read it.
- Duration, streams, loudness, and obvious black/silent sections are checked.
- Text is readable on the target format.
- Captions and cut points follow transcript boundaries when speech matters.
- Music is scene-mapped, not a flat bed under every beat.
- Mastering uses one loudness pass around `-14 LUFS / -1 dBTP` for social video.
- Exported EDL/OTIO/FCPXML files are produced when requested.

For code changes:

```bash
pnpm typecheck
pnpm verify
pnpm validate
python -m pytest tests
```

If a check cannot run, say exactly why.

## CLI Command Map

Agents should prefer the public CLI when it exists:

| Need | Command |
| --- | --- |
| environment check | `montara doctor` |
| setup guidance | `montara doctor --fix` |
| full local production | `montara make "<idea>"` |
| inspect plan only | `montara plan "<idea>"` |
| render IR | `montara render <ir.json> [out.mp4]` (auto-writes `.edl/.otio/.fcpxml`) |
| source/reference analysis | `montara analyze <mp4>` or `montara understand <mp4>` |
| audio/music analysis | `montara hear <audio>` or `montara music analyze <audio>` |
| smart source reel | `montara reel <input.mp4>` |
| Python compose artifact render | `montara compose <edit-decisions.json> [out.mp4] [--assets asset-manifest.json]` |
| stock/corpus discovery and retrieval | `montara corpus sources|build|search|stats|get` |
| provider audit / smoke | `montara providers audit` and `montara providers smoke <provider-id> [--live]` |
| editor handoff | `montara export <timeline.json> --to otio|fcpxml|edl [out]` |
| engine inventory | `montara engines` |
| Python engine bridge | `montara engine info|smoke|providers|timeline|render` |
| speaker matching | `montara voiceid ...` |

When the CLI does not yet expose a tool, use the Python tool registry directly
and add a CLI follow-up if the workflow is user-facing.

## Implementation Checklist For New Capabilities

New user-facing capabilities are not complete until they have:

- a tool contract or TypeScript API;
- selector/fallback behavior when appropriate;
- Layer 2 skill guidance;
- Layer 3 skill links if provider/runtime-specific;
- Timeline IR integration or a clear artifact bridge;
- validate or pytest coverage;
- docs update;
- honest runtime/provider status.

## Output Profiles

The output profile affects script density, safe zones, captions, and render
settings. Do not treat it as a resize-only flag.

| Profile | Typical use | Agent cautions |
| --- | --- | --- |
| 16:9 YouTube | explainers, demos, documentary | give charts and captions breathing room |
| 9:16 Shorts/Reels/TikTok | clips, hooks, fast explainers | cut on transcript boundaries; protect face/text safe zones |
| 1:1 social | feed posts and compact demos | avoid dense horizontal UI; use larger labels |
| 21:9 cinematic | trailers and mood pieces | captions/lower-thirds need extra care |
| 4K | high-end demos and archival output | validate source resolution; do not upscale weak assets blindly |

When the user asks for multiple profiles, keep one master Timeline IR and derive
profile-specific timelines with explicit crop/reframe decisions.

## Security And Privacy

Montara often touches private footage, dashboards, auth state, and API keys.

- Never commit `.env`, Playwright `storageState`, private user media, generated
  project directories, local corpora, or model weights.
- Do not print secrets; report only env var names and configured/unconfigured booleans.
- Review authenticated screen recordings for private data before publishing.
- Blur, crop, or remove account names, email addresses, tokens, customer data,
  analytics dashboards, and browser extensions when they are not part of the story.
- Store temporary auth files under `projects/<project>/auth/`, which is ignored.
- For speaker/voice intelligence, use labelled references the user has rights to process.

If privacy risk is high, stop and ask before rendering or exporting.

## Common Failure Modes

| Failure | What to do |
| --- | --- |
| Missing FFmpeg | Run `montara doctor --fix`; no render promise until FFmpeg works. |
| Native runtime missing | Explain the missing runtime and use FFmpeg only if the creative promise survives. |
| Cloud key missing | Offer local/free fallback or ask user to configure the key. |
| Provider API drift | Check official docs and update request builder before live spend. |
| Source footage is weak | Preserve strongest moments and add support visuals; do not over-edit into noise. |
| Captions cover subject/UI | Reposition, shorten, or switch to subtitles only. |
| Music masks speech | Lower gain, duck under voice, or add silence. |
| Output is static | Add motion, cuts, source movement, or change the promise to a still-led piece. |
| No real understanding path | Say current analysis is signal/frame based; do not call it CLIP/BLIP. |

## Commit Protocol

For this repository, use sequential commit subjects when the user asks for commits:

```text
0x26
0x27
0x28
```

Include the Warfront AI co-author trailer for new Montara work:

```text
Co-Authored-By: WARFRONT AI <hello@warfront.live>
```

Only commit after the relevant stage is complete and the appropriate gates have
run or the blocker is documented. Keep unrelated user changes intact.

## Done Means

For Montara, "done" means the user can watch or edit the result:

- the final MP4 exists;
- the Timeline IR exists and validates;
- requested editor exports exist;
- QA notes are written or summarized;
- runtime/provider fallbacks are disclosed;
- gates are green for code changes.

## Skills To Prefer

Montara should continue absorbing high-value public skills and internalizing
them as Montara Layer 2 skills instead of vague advice. Good candidates include:

- GSAP core, timeline, performance, plugins, and React integration;
- Three.js fundamentals, materials, lighting, shaders, postprocessing, and loaders;
- HyperFrames authoring, CLI, registry, and website-to-video;
- Manim composer and ManimCE best practices;
- FFmpeg, video-understand, video-edit, speech-to-text, and music/audio skills;
- Playwright recording and browser auth workflows;
- visual-style, D3 visualization, character rigging, and SVG/canvas animation.

When adapting outside skills, keep Montara-specific guidance in `skills/` and
provider/tool-specific raw knowledge in `.agents/skills/`.

## Never Do

- Claim a runtime is production-ready because a package name exists.
- Call current FFmpeg signal analysis "real CLIP/BLIP vision."
- Require API keys for a basic video.
- Commit auth state, `.env`, private source media, or generated user artifacts.
- Hide cost, auth, missing dependency, or fallback decisions.
- Ship a broken or unreviewed MP4.

If you only remember one thing: understand the source, update the Timeline IR,
render a real MP4, QA it, then export the formats the user asked for.
