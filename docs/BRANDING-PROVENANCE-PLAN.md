# Montara Branding and Provenance Plan

This plan makes Montara visibly Montara while keeping the project legally and ethically clean.
Montara can rebrand product surfaces, improve the engine, and mark Warfront AI authorship for new
work. It must not hide provenance, remove required notices, or pretend copied/derived code was
written from scratch.

## Hard Boundary

Allowed:

- Replace legacy project names in code identifiers, comments, prompts, emitted artifacts, package
  metadata, docs, tests, and filenames where the reference is product branding.
- Replace project shorthand such as the old standalone two-letter form only when it means the old
  project name.
- Add Montara and Warfront AI copyright/co-author notices for new Montara work.
- Treat code written from this point forward as Montara/Warfront AI authored work. New files,
  new adapters, new tests, new bridge logic, and new user-facing copy should use Montara naming
  only, unless a legal/provenance surface is explicitly attributing derived source.
- Keep clear attribution for derived code in `NOTICE`, license files, and porting/provenance docs.
- Make real improvements that distinguish Montara: IR bridges, CLI wrappers, fallback behavior,
  verification gates, clearer errors, security hygiene, packaging, and user-facing polish.

Not allowed:

- Remove required AGPL notices or upstream copyright attribution.
- Edit comments/docs only to conceal derivation.
- Falsify authorship or history.
- Rename symbols blindly in ways that break imports, schemas, checkpoints, or compatibility.
- Claim the engine is not derived from the source project where attribution is legally required.

## Current State

- The Python engine mirror now lives at the repository root (`tools/`, `lib/`,
  `skills/`, `pipeline_defs/`, `schemas/`) behind `engine_bridge.py`.
- Legacy full-name branding has been scrubbed from the imported Python tree.
- A repository scan found one remaining source-code shorthand label; it was renamed to
  `source-faithful`.
- The root plan now says Stage 1A is Python-engine-first with TypeScript boundaries.
- `pnpm verify` and `pnpm validate` were green after the import.

## Branding Passes

1. **Code string scan**
   - Scan all tracked and intended-to-track source files for legacy full-name variants and the
     old standalone two-letter project shorthand.
   - Replace product-branding references with `Montara`, `montara`, `MONTARA`, or neutral
     `source` wording.
   - Do not replace normal words, protocol terms, dependency names, or required attribution.

2. **Filename and path scan**
   - Rename files and folders containing old project branding.
   - Update imports, configs, test references, and docs in the same change.
   - Run gates after every batch.

3. **Runtime artifact scan**
   - Check prompts, templates, generated markdown, JSON schema defaults, checkpoint output,
     proposal packets, rendered captions, and CLI messages.
   - Product-facing output should say Montara or Warfront AI where appropriate.
   - Required attribution should stay in legal/provenance surfaces, not leak into normal user videos.

4. **Metadata scan**
   - Update `package.json`, `setup.py`, README-like surfaces, CLI help, assistant configs,
     pipeline manifests, schema titles, and tool descriptions.
   - Add Montara and Warfront AI project ownership metadata where accurate.

5. **Legal/provenance surfaces**
   - Keep AGPL license compliance.
   - Maintain `NOTICE` and porting/provenance docs with source-project attribution.
   - Add a Montara/Warfront AI section that clearly states which work is Montara-specific.

## Warfront AI Visibility

Warfront AI should be visible in truthful places:

- commit trailers for new work: `Co-Authored-By: WARFRONT AI <hello@warfront.live>`;
- headers or provenance notes for new Montara-only modules where the file establishes a new
  boundary, adapter, test harness, or user-facing behavior;
- `NOTICE` or provenance docs for Montara-specific additions;
- package metadata, CLI banners, generated project reports, and docs where product ownership is
  expected;
- comments only when they explain a real Montara/Warfront behavior, not as filler.

## Improvement Passes

Each branding batch should include at least one real improvement so Montara becomes a better engine,
not just a renamed tree:

- add a bridge test or smoke test;
- improve an error message or fallback path;
- tighten a schema or type boundary;
- remove a secret/generated-file risk;
- make CLI discovery clearer;
- add an adapter around the Python engine;
- add verification for a user-visible artifact.

## Verification Gates

Run after each batch:

```powershell
rg -n --hidden "<legacy-name-patterns>" . --glob "!**/.git/**" --glob "!**/__pycache__/**" --glob "!node_modules/**"
pnpm verify
pnpm validate
```

For Python-only batches, also run a no-bytecode AST parse from the repository root,
excluding caches and generated output directories.

## Execution Order

1. Finish source-code scan and neutralize product-branding leftovers.
2. Scan intended committed docs and metadata, preserving legal attribution.
3. Scan runtime output strings and generated artifact templates.
4. Add Warfront AI visibility to truthful ownership/provenance surfaces.
5. Add Stage 1A.1 CLI bridge so Montara deliberately invokes the Python engine.
6. Re-run all gates and record results in the final handoff.
