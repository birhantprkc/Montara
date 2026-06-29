# Montara Stage 1A Bridge Plan

This supersedes the old TypeScript-first clone sequence. The current plan is to keep the mature
Python engine runnable inside Montara, wrap it with typed Montara boundaries, and replace modules
only when a verified replacement is better.

## Current Foundation

- Python engine mirror: root-level `tools/`, `lib/`, `skills/`, `pipeline_defs/`, and `schemas/`
- Montara planning contract: `PLAN.md`
- Branding/provenance contract: `BRANDING-PROVENANCE-PLAN.md`
- Provenance record: `docs/PORTING-PROVENANCE.md`
- Parity tracker: `docs/MONTARA-PARITY.md`

## Rules

1. New code from this point forward is Montara / Warfront AI authored work unless a file explicitly
   states another source.
2. Product-facing code, comments, prompts, CLI messages, templates, generated artifacts, and docs
   use Montara naming.
3. Legal attribution stays in `NOTICE`, `LICENSE`, and `docs/PORTING-PROVENANCE.md`.
4. Do not blindly rename imports, schema fields, checkpoint keys, provider payloads, or filenames
   that are externally required.
5. Every bridge or replacement ships with a verification case.
6. Gates must stay green: `pnpm verify` and `pnpm validate`.

## Stage 1A Work

| Phase | Deliverable | Done when |
|---|---|---|
| 1A.0 | Python engine mirror | Done: copied to the repo root, branded, AST parsed, root gates green |
| 1A.1 | CLI bridge | `montara doctor` reports Python engine readiness and a smoke command invokes it |
| 1A.2 | Timeline bridge | Python plans/artifacts convert to Montara Timeline IR without a parallel format |
| 1A.3 | Render bridge | A bridged plan renders a real MP4 with Montara fallback behavior |
| 1A.4 | Provider/runtime bridge | Env and provider discovery work without secrets or hard failures |
| 1A.5 | Test parity | High-value Python smokes are represented in Montara gates |
| 1A.6 | Compliance cleanup | Branding scan is clean outside legal/provenance surfaces |

## Verification Batch

After each batch:

```powershell
pnpm verify
pnpm validate
```

For Python-only edits, run a no-bytecode AST syntax pass from the repository root,
excluding caches and generated output directories.

## Next Task

Implement Stage 1A.1: add a deliberate CLI bridge so Montara can discover and invoke the Python
engine instead of treating it as a copied folder.
