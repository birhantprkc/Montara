# Driving Montara

Montara turns an idea into a finished video. It is **local-first** (no API keys required to make a
video), **IR-centric** (everything is a transform on one Timeline IR), and **readable-system**: an
assistant drives it by reading these skill files and running the `montara` CLI. There is no MCP.

## The loop

```
research → plan → script → populate(IR) → enrich → render → qa → master
```

A run can stop and resume at any stage — progress is persisted as a JSON **checkpoint**
(`skills/core/` concepts below; the stages are the eight names above).

## Three knowledge layers

1. **Tools + pipeline defs** — what Montara can do and the catalogue of pipeline shapes:
   [`cli.md`](cli.md), [`timeline-ir.md`](timeline-ir.md), [`tools.md`](tools.md),
   and the pipeline manifests under [`../../pipelines/`](../../pipelines) (one YAML per shape).
2. **Skills** — how to use the pipelines well: [`../creative/documentary-craft.md`](../creative/documentary-craft.md).
3. **External tech packs** — the underlying engines/runtimes: [`../meta/tech-packs.md`](../meta/tech-packs.md).

## Quickstart for an assistant

```bash
pnpm montara doctor                              # confirm ffmpeg is present
pnpm montara pipelines                           # list the pipeline shapes
pnpm montara research "<idea>"                    # plan 15-25 searches → research brief
pnpm montara make --pipeline documentary-montage "<idea>"   # plan → gate → render → self-review
pnpm montara review out/<name>.mp4               # post-render quality report
```

## Two rules that never change

- **Every artifact is the Timeline IR or derived from it.** Build it, validate it, render it.
- **Degrade, never fail.** With no model and no footage, a pipeline still renders a clean, titled,
  paced MP4 — a run always yields something watchable.
