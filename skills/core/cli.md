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
| `render <ir.json>` | Render a ScenePlan, edit decisions, or Timeline IR JSON to MP4. |
| `review <mp4>` | Emit a post-render self-review report for an existing MP4. |
| `export <ir.json> --to otio\|fcpxml\|edl` | Export Timeline IR for professional editors. |
| `import <file>` | Import EDL/OTIO/FCPXML back into Timeline IR where supported. |
| `capture ...` | Record browser demos with Playwright guidance and login storageState support. |
| `compose ...` | Route Python `video_compose` / HyperFrames-style artifacts into MP4. |
| `corpus ...` | Discover, build, search, and inspect footage/source corpora. |
| `budget ...` | Check cost caps and provider spend decisions. |
| `resume ...` | Inspect or continue a headless run checkpoint. |
| `agent` | Regenerate pipeline manifests, JSON schemas, and per-assistant configs. |

Options for `plan` and `make`:

- `--pipeline, -p <id>` sets the pipeline shape.
- `--seconds, -s <n>` sets the target runtime.

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
