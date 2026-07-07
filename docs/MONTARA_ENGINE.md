# Montara Python Engine

Montara keeps the mature Python media engine at the repository root while TypeScript owns the
Timeline IR, CLI, render/export adapters, and verification gates.

## What Landed

- Engine modules live beside the TypeScript packages: `tools/`, `lib/`, `skills/`,
  `pipeline_defs/`, `schemas/`, `styles/`, and `tests/`.
- Generated/private/runtime artifacts are excluded: VCS history, virtualenvs, caches,
  local outputs, corpora, secrets, token files, model weights, and generated media.
- Product-facing naming is Montara; attribution stays in `NOTICE`, `LICENSE`,
  and `docs/ATTRIBUTION.md`.
- The dependency-free `engine_bridge.py` boundary lets TypeScript discover and invoke
  the Python engine through JSON.
- Root gates stay green: typecheck, verify, validate, and pytest.

## How To Treat The Engine

- Treat root-level Python as the parity engine until Montara has a stronger verified
  replacement for a specific boundary.
- Keep pure Timeline IR logic in TypeScript core.
- Replace Python modules only when parity tests pass and the replacement improves the boundary.
- Do not add secrets, generated media, local corpora, model weights, or runtime caches.
- Do not reintroduce legacy project branding into product-facing code, prompts, CLI output,
  generated artifacts, or filenames.

## Verification

From `C:\montara`, run:

```powershell
npm.cmd run typecheck
npm.cmd run verify
npm.cmd run validate
python -m pytest tests
```

For Python-only syntax checks without writing bytecode:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python - <<'PY'
import ast
from pathlib import Path

skip = {'.git', 'node_modules', 'out', 'projects', '__pycache__'}
bad = []
count = 0
for file in Path('.').rglob('*.py'):
    if any(part in skip for part in file.parts):
        continue
    count += 1
    try:
        ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
    except SyntaxError as exc:
        bad.append((file, exc.lineno, exc.msg))
print(f'parsed {count} python files')
for path, line, msg in bad:
    print(f'{path}:{line}: {msg}')
raise SystemExit(1 if bad else 0)
PY
```
