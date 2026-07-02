# The `montara` CLI

Run via `pnpm montara <command>` or `npm run montara -- <command>` during local
development. On Windows in this repo, `npm.cmd run montara -- <command>` is the
most reliable form. Every command should degrade to a local/free path and write
generated outputs under `./out` unless the user gives an explicit path.

## Core commands

| Command | What it does |
|---|---|
| `doctor [--fix]` | Check local prerequisites and print setup guidance. |
| `status [--json] [--out path]` | Summarize local capability, documented gates, and upstream parity categories. |
| `pipelines` | List the available pipeline shapes. |
| `tools` | List local/free provider tools and their routing metadata. |
| `research <idea>` | Plan broad research searches and write a research brief. |
| `plan [opts] <idea>` | Write a structured scene plan JSON. |
| `make [opts] <idea>` | Plan -> pre-compose gate -> compose -> render -> post-render review. |
| `project init <name>` | Create the gitignored project workspace layout and `project.json` manifest. |
| `render <ir.json>` | Render a ScenePlan, edit decisions, or Timeline IR JSON to MP4. |
| `review <mp4>` | Emit a post-render self-review report for an existing MP4. |
| `analyze <url\|file>` | Analyze a local reference video, or write a URL materialization/research preflight. |
| `export <ir.json> --to otio\|fcpxml\|edl` | Export Timeline IR for professional editors. |
| `import <file>` | Import EDL/OTIO/FCPXML back into Timeline IR where supported. |
| `capture ...` | Record browser demos, pick up completed desktop recordings, and guide Playwright login storageState support. |
| `compose ...` | Route Python `video_compose` / HyperFrames-style artifacts into MP4. |
| `corpus ...` | Discover, seed fixtures, build, search, and inspect footage/source corpora. |
| `budget ...` | Check cost caps and provider spend decisions. |
| `resume ...` | Inspect or continue a headless run checkpoint. |
| `agent` | Regenerate pipeline manifests, JSON schemas, and per-assistant configs. |

Options for `plan` and `make`:

- `--pipeline, -p <id>` sets the pipeline shape.
- `--seconds, -s <n>` sets the target runtime.
- `--brain` asks a reachable local Ollama/LM Studio/llama.cpp model to rewrite
  the brief; if none answers, the deterministic local planner continues.
- `--brain-timeout-ms <n>` bounds that local brain attempt.

`make` is gated: if the pre-compose check finds a broken delivery promise, invalid
IR, missing renderer, or runtime overclaim, it blocks and prints the blockers
instead of pretending the render succeeded. After a successful render it writes a
`*.self-review.json` next to the MP4.

## Runtime manager

Use the runtime manager for external local generation servers. Montara does not
vendor ComfyUI, A1111, model weights, or their licenses.

| Command | What it does |
|---|---|
| `runtimes status [--json] [--out path] [--no-probe]` | Report ComfyUI/A1111 env URLs, localhost health, and license boundaries. |
| `runtimes install-plan <comfyui\|a1111>` | Print human setup guidance without writing files. |
| `runtimes plan <comfyui\|a1111> [--root dir]` | Show managed install and launch recipes. |
| `runtimes install <comfyui\|a1111> [--root dir] [--json]` | Dry-run the install recipe. |
| `runtimes launch <comfyui\|a1111> [--root dir] [--json]` | Dry-run the launch recipe. |
| `runtimes write-env <comfyui\|a1111> [--out path] [--root dir]` | Write env hints such as `COMFYUI_URL` and `MONTARA_RUNTIMES_DIR`. |
| `runtimes write-script <comfyui\|a1111> [--out path] [--root dir] [--launch]` | Write a PowerShell or shell install/launch script. |

Install and launch are dry-run by default. Only pass `--execute` when the user has
explicitly asked to install or start external runtimes. Managed installs write
outside the Montara repo by default: `MONTARA_RUNTIMES_DIR`, then
`%LOCALAPPDATA%/Montara/runtimes` on Windows, otherwise `$HOME/.montara/runtimes`.

## Corpus CLI

Use corpus commands for documentary-montage and source-footage workflows.

| Command | What it does |
|---|---|
| `corpus sources [--json]` | Show configured/unconfigured stock source providers through Python `corpus_builder.get_info()`. |
| `corpus seed-fixture <corpus-dir> <clip.mp4> [clip2.mp4 ...] [--query TEXT]` | Create an offline Python-compatible fixture corpus from local clips for validation and smoke tests. |
| `corpus build <corpus-dir> "query" [--query TEXT ...] [--source NAME]` | Populate a real source corpus through stock providers. This may require API keys or network opt-in. |
| `corpus search <corpus-dir> "slot description" [--k 10] [--motion-min 0.2]` | Rank corpus clips for a documentary slot through Python `clip_search`. |
| `corpus stats <corpus-dir>` | Summarize rows, source mix, media kinds, and motion/duration stats. |
| `corpus get <corpus-dir> <clip-id>` | Inspect one corpus record with provenance. |

`seed-fixture` is not a stock acquisition path. Use it only to validate the
corpus/search/compose contract offline, then use `build` or user-supplied clips
for real documentary work.

## Capture CLI

Use capture commands for screen-demo and software-trailer source footage.

| Command | What it does |
|---|---|
| `capture recommend [--url URL]` | Pick FFmpeg, Cap, or Playwright based on the brief and installed providers. |
| `capture login --url URL [--auth-state path]` | Let the user log in once and save a Playwright storageState file outside git. |
| `capture record --url URL out/browser.mp4 [--auth-state path]` | Record a browser walkthrough when Playwright/Chromium are installed. |
| `capture pick-latest --recordings-dir dir --output out/screen.mp4` | Materialize the latest completed local recording artifact for screen-demo composition. |

`pick-latest` is the deterministic offline validation path and the safest route
when a user records a native desktop app with Cap, FFmpeg, OBS, or another tool.
Do not claim live Playwright or desktop automation succeeded unless the command
actually recorded a real MP4.

## Agent rule

Before broad claims, run:

```bash
npm.cmd run montara -- status --json --out out/montara-status.json
npm.cmd run verify
npm.cmd run validate
```

For Python changes, also run:

```bash
python -m pytest tests
```
