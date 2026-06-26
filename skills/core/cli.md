# The `montara` CLI

Run via `pnpm montara <command>` (or `node packages/cli/.montara.mjs <command>` after a build).
Every command degrades to a local/free path and writes outputs under `./out`.

| Command | What it does |
|---|---|
| `doctor` | Check local render prerequisites (Node, ffmpeg, ffprobe). |
| `pipelines` | List the available pipeline shapes. |
| `tools` | List the local/free provider tools (image/video/tts/music/post/analysis). |
| `research <idea>` | Plan 15–25 searches across YouTube/Reddit/HN/news/academic; write a research brief. |
| `plan [opts] <idea>` | Write a structured scene plan JSON. |
| `make [opts] <idea>` | Plan → **pre-compose gate** → compose → render → **post-render self-review**. |
| `render <ir.json>` | Render a ScenePlan or Timeline IR JSON to MP4. |
| `review <mp4>` | Emit a post-render self-review report for an existing MP4. |
| `agent` | Regenerate the YAML pipeline manifests + JSON schemas, and emit per-assistant configs. |

Options for `plan` / `make`:

- `--pipeline, -p <id>` — pipeline shape (default `animated-explainer`).
- `--seconds, -s <n>` — target runtime in seconds.

`make` is gated: if the pre-compose check finds a broken delivery promise, an invalid IR, or a
missing renderer, it **blocks** and prints the blockers instead of rendering. After a successful
render it writes a `*.self-review.json` next to the MP4.
