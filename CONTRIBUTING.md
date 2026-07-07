# Contributing To Montara

Thanks for helping improve Montara. This guide is for human developers; agent
operation details live in `AGENT_GUIDE.md`.

## Setup

```bash
pnpm install
python -m pip install -r requirements/dev.txt
copy .env.example .env
pnpm run montara doctor
```

On Windows, you can run:

```bat
scripts\setup.bat
```

## Development Loop

Before opening a PR or pushing a public demo change, run:

```bash
pnpm typecheck
pnpm verify
pnpm validate
```

Run Python tests when the Python dev dependencies are installed:

```bash
python -m pytest tests
```

## Rules Of Thumb

- Keep secrets, auth state, model weights, and private media out of git.
- Keep generated outputs in `out/`, `projects/`, or another ignored workspace.
- Keep `tools/`, `lib/`, `schemas/`, `pipeline_defs/`, and `skills/` at repo root unless the bridge contract changes with tests.
- New user-facing capabilities should include a validation path or a clear runtime gate.
- Public claims should match artifacts that a reviewer can reproduce.

## Pull Request Checklist

- The README or docs changed when behavior/setup changed.
- New env vars are documented in `.env.example`.
- New generated demos are reproducible through a script.
- `pnpm verify` and `pnpm validate` are green, or the PR states why they were not run.
