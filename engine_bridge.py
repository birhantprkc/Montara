#!/usr/bin/env python3
"""Montara <-> Python engine process bridge.

A stdlib-only JSON contract between the TypeScript boundary and the local Python
engine. The TS side (`@montara/engine`) shells out to this script and parses a
single JSON object from stdout. Keeping the bridge dependency-free means engine
discovery and the integrity smoke run with **zero pip installs** — the no-key,
runs-first-try guarantee the rest of the system depends on.

Usage:
    python engine_bridge.py info      # engine discovery (counts, pipelines, readiness)
    python engine_bridge.py verify    # AST integrity smoke over lib/ + tools/
"""
from __future__ import annotations

import ast
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENGINE_DIRS = ["lib", "tools", "skills", "schemas", "pipeline_defs", "styles", "remotion-composer"]


def _count(pattern: str) -> int:
    return len(glob.glob(str(ROOT / pattern), recursive=True))


def _pipelines() -> list[str]:
    d = ROOT / "pipeline_defs"
    return sorted(p.stem for p in d.glob("*.yaml")) if d.is_dir() else []


def info() -> dict:
    """Discover the engine: presence of its directories, content counts, pipelines."""
    missing = [d for d in ENGINE_DIRS if not (ROOT / d).is_dir()]
    return {
        "ok": not missing,
        "python_version": sys.version.split()[0],
        "executable": sys.executable,
        "engine_root": str(ROOT),
        "tools": _count("tools/**/*.py"),
        "lib": _count("lib/**/*.py"),
        "skills": _count("skills/**/*.md"),
        "schemas": _count("schemas/**/*.json"),
        "pipelines": _pipelines(),
        "missing": missing,
    }


def verify() -> dict:
    """Integrity smoke: AST-parse every engine module under lib/ and tools/."""
    targets: list[Path] = []
    for sub in ("lib", "tools"):
        sub_dir = ROOT / sub
        if sub_dir.is_dir():
            targets.extend(sub_dir.rglob("*.py"))
    bad = []
    for f in targets:
        try:
            ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
        except SyntaxError as exc:
            bad.append({"file": str(f.relative_to(ROOT)), "line": exc.lineno, "msg": exc.msg})
    return {"ok": not bad, "parsed": len(targets), "errors": len(bad), "bad": bad[:10]}


COMMANDS = {"info": info, "verify": verify}


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "info"
    fn = COMMANDS.get(cmd)
    if fn is None:
        print(json.dumps({"ok": False, "error": f"unknown command: {cmd}", "commands": sorted(COMMANDS)}))
        return 2
    print(json.dumps(fn()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
