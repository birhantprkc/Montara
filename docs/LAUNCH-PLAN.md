# Montara Public Launch Plan

This plan turns Montara's verified local demos into public proof without
overclaiming unfinished runtimes. The goal is simple: someone should be able to
watch a short launch video, clone the repo, run the same commands, and inspect
the same kind of MP4 or Timeline IR locally.

## Launch Principles

1. Show real artifacts, not mockups.
2. Prefer zero-key local commands.
3. Label runtime-gated paths clearly.
4. Never call a cloud provider production-ready without a recent live BYOK
   smoke recorded in `docs/PROVIDER-AUDIT.md`.
5. Link every public claim to a command, artifact, or skill.

## Proof Set

Use these as the first public proof set. They are already represented in
`README.md` and `docs/DEMOS.md`.

| Proof | Command | Artifact | Public point |
| --- | --- | --- | --- |
| One Timeline IR | `npm.cmd run validate` | `out/validate-compose-core.timeline.json`, `out/validate-compose-core.mp4` | Montara plans, edits, renders, and exports one canonical JSON timeline. |
| Smart reel | `npm.cmd run validate` | `out/validate-smart-reel.mp4` | Reels are source-aware and editable, not a fixed hook template. |
| Python engine bridge | `npm.cmd run validate` | `out/validate-cli-video-compose.mp4` | Montara can drive the Python media engine through the CLI and still land in MP4. |
| Native Remotion smoke | `npm.cmd run validate` | `out/validate-remotion-native.mp4` when installed | Remotion is validate-gated; missing deps are reported honestly. |
| Editor handoff | `npm.cmd run montara -- export out/validate-compose-core.timeline.json --to otio out/validate-compose-core.otio` | OTIO, EDL, or FCPXML | Pro-editor export is part of the core workflow. |
| Auth browser capture | `npm.cmd run montara -- capture login --url <site>` then capture | `out/browser-capture.mp4` | User-owned login state enables authorized website demos without committing secrets. |

## Launch Video Sequence

Create five short videos before any broad community push:

1. **Montara in 60 seconds:** show the Timeline IR, local MP4 render, and editor
   export in one screen recording.
2. **Smart reel proof:** use a talking-head or sample clip, then show the
   content-aware reel and the editable Timeline IR.
3. **Renderer honesty:** show FFmpeg as the universal fallback, plus Remotion
   native smoke when installed. Say "runtime-gated" where appropriate.
4. **Website/app trailer:** use Playwright login capture or desktop capture,
   then cut the result into a product-demo MP4.
5. **Documentary craft:** use the generalized evidence-craft skill with
   scene-mapped music, factual maps, transcript-verified cuts, and -14 LUFS
   mastering.

Each video should include the command that generated it, the output path, and
whether it used only local/free tools or an optional BYOK/cloud runtime.

## Community Kit

Publish these together:

- `README.md`: quick start, state table, demo gallery, latest gates.
- `docs/DEMOS.md`: proof ledger with prompt, pipeline, runtime, cost, artifact.
- `PROMPT_GALLERY.md`: copy-paste prompts for users and assistants.
- `docs/CAPABILITY-SNAPSHOT.md`: current truth by subsystem.
- `docs/PROVIDER-AUDIT.md`: cloud fixture/live status.
- `AGENT_GUIDE.md`: how external assistants should operate Montara.
- `docs/LAUNCH-PLAN.md`: this launch operating plan.

Keep screenshots or videos generated from private customer media out of the
repo. Public launch assets should use checked-in generated demos, synthetic
fixtures, or clearly licensed source media.

## YouTube Packaging

For each public YouTube upload:

- Title: name the concrete proof, not a vague claim.
- Description: include the exact command, artifact path, and repo links.
- Chapters: include setup, command, output, inspection, and caveats.
- Thumbnail: use a frame from the real artifact plus a short claim like
  "Timeline IR to MP4" or "Reel without hardcoded hooks".
- Audio: master to the social default in Montara, -14 LUFS / -1 dBTP / 48 kHz.
- Pinned comment: list what is runtime-gated and what is fully local today.

Do not use titles such as "fully autonomous pro video studio" until the local
orchestrator, native render defaults, and runtime manager are actually shipped.

## Release Checklist

Before publishing a launch post or video:

- `npm.cmd run typecheck` passed.
- `npm.cmd run verify` passed.
- `npm.cmd run validate` passed and produced the referenced MP4s.
- Python tests passed with a writable pytest base temp/cache if Python-facing
  behavior changed.
- Any cloud-provider claim has a redacted dry-run fixture and, for production
  readiness, a recent live BYOK smoke record.
- Demo artifacts are generated from public, synthetic, or licensed media.
- Runtime caveats are visible in the post, not buried in a later issue.
- The linked prompt lives in `PROMPT_GALLERY.md` or `docs/DEMOS.md`.

## Community Issues To Open

Open focused issues rather than vague roadmap posts:

| Issue | Why it helps |
| --- | --- |
| Native Remotion Timeline routing | Converts the current native smoke into the default composition path. |
| Revideo and Motion Canvas native packages | Turns registered adapters into verified renderers. |
| Real CLIP/BLIP local understanding | Replaces signal-only understanding with actual local vision models. |
| Runtime manager for ComfyUI/A1111 | Makes local generation setup repeatable. |
| Compare report automation | Lets `montara status` produce a fresh parity report against OpenMontage-style categories. |

## Metrics

Track only metrics that improve the product:

- first-run success rate for `montara doctor`, `verify`, and `validate`;
- number of users who regenerate a demo MP4 locally;
- reported runtime-gated confusion in issues;
- public demo videos with reproducible command/artifact links;
- provider live-smoke confirmations by date.

Stars, likes, and views are useful signals, but the launch is only successful if
new users can reproduce the proof set and understand what is finished, partial,
or planned.

## Done Means

Stage 4.8 is done when this plan exists, is linked from the README and demo
docs, and `verify` checks that it names reproducible artifacts, runtime honesty,
cloud audit rules, and at least five public proof videos.
