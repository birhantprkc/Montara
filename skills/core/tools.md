# Provider tools, selection, and governance

## Local/free provider tools (`@montara/providers`)

Every tool works offline through the Timeline IR and ffmpeg, so a run never blocks on a key. List
them with `montara tools`. They span six categories — **image, video, tts, music, post, analysis** —
and include caption-card image/video fallbacks, a silent voice bed, a tone score, subtitle export
(SRT/VTT), trim, stitch, media probe, and frame sampling. Cloud/local-runtime tools plug in later
behind the same shape; the local-free tier is always present as the fallback.

## Scored selection (`@montara/quality`)

When several tools could do a job, `selectProviderTool(tools, category)` ranks them on seven
weighted dimensions — **task-fit 30 / quality 20 / control 15 / reliability 15 / cost 10 /
latency 5 / continuity 5** (sums to 100) — and returns the winner with its score and the
alternatives it beat. Every pick is written to a **decision trail** (alternatives + confidence).

## Governance (`@montara/quality`)

- **Pre-compose gate** — blocks a render on a broken delivery promise (duration / aspect / scene
  count / audio), an invalid IR, or a missing renderer. Slideshow risk is a warning by default and
  a hard block only when the caller sets a cap.
- **Slideshow-risk score** — flags "animated PowerPoint" (static holds, no motion, no audio bed,
  too few cuts).
- **Post-render self-review** — reads the finished MP4 back: streams + duration, four-position
  frame-decode checks, audio silence/clip detection, delivery-promise reconciliation, subtitle
  presence. Emits a JSON report; only structural breakage fails, calibration issues warn.
- **Budget** — `estimate → reserve → reconcile` in `observe` / `warn` / `cap` modes (defaults:
  $0.50 per action, $10.00 total).

## Research (`@montara/research`)

`runResearch(idea)` plans 15–25 searches across YouTube/Reddit/HN/news/academic and returns a
brief (queries, findings, angles); network is opt-in and degrades to a deterministic offline brief.
`indexFootage` / `retrieveFootage` provide semantic (cosine-similarity) footage retrieval that runs
fully offline today and accepts a real CLIP embedder later behind the same interface.
