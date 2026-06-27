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
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENGINE_DIRS = ["lib", "tools", "skills", "schemas", "pipeline_defs", "styles", "remotion-composer"]
PROVIDER_DIRS = [
    "audio", "video", "graphics", "avatar", "subtitle",
    "character", "capture", "enhancement", "publishers", "analysis",
]
_CRED_RE = re.compile(r'(?:os\.environ\.get|os\.getenv)\(\s*["\']([A-Z][A-Z0-9_]+)["\']|env:([A-Z][A-Z0-9_]+)')
_CRED_HINT = re.compile(r'KEY|TOKEN|SECRET|CRED|PASSWORD')


def _attr(text: str, name: str) -> str | None:
    m = re.search(rf'\b{name}\s*=\s*["\']([^"\']+)["\']', text)
    return m.group(1) if m else None


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


def compositions() -> dict:
    """List the engine's checked-in zero-key compositions (Remotion demo props)."""
    d = ROOT / "remotion-composer" / "public" / "demo-props"
    names = sorted(p.stem for p in d.glob("*.json")) if d.is_dir() else []
    return {"ok": True, "compositions": names}


def composition(name: str) -> dict:
    """Emit one engine composition (cuts/theme/audio) for the Timeline-IR bridge."""
    path = ROOT / "remotion-composer" / "public" / "demo-props" / f"{name}.json"
    if not path.is_file():
        return {"ok": False, "error": f"composition not found: {name}"}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def providers() -> dict:
    """Discover the engine's provider tools WITHOUT importing them (dependency-free) and
    report which are configured — by env-var presence only, never the secret values."""
    out = []
    for sub in PROVIDER_DIRS:
        d = ROOT / "tools" / sub
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.py")):
            if f.name in ("__init__.py", "_shared.py", "base_tool.py"):
                continue
            text = f.read_text(encoding="utf-8", errors="ignore")
            name = _attr(text, "name")
            capability = _attr(text, "capability")
            if not name or not capability:
                continue  # not a BaseTool provider
            creds = [a or b for a, b in _CRED_RE.findall(text)]
            auth_env = next((c for c in creds if _CRED_HINT.search(c)), None)
            out.append({
                "name": name,
                "provider": _attr(text, "provider") or name,
                "capability": capability,
                "category": sub,
                "auth_env": auth_env,
                "configured": bool(auth_env and os.environ.get(auth_env)),
                "local": auth_env is None,
            })
    by_cap: dict[str, int] = {}
    for p in out:
        by_cap[p["capability"]] = by_cap.get(p["capability"], 0) + 1
    return {
        "ok": True,
        "total": len(out),
        "configured": sum(1 for p in out if p["configured"]),
        "local": sum(1 for p in out if p["local"]),
        "by_capability": by_cap,
        "providers": out,
    }


def selfcheck() -> dict:
    """High-value engine integrity smokes, dependency-free — brought into the Montara gates."""
    checks = []

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    schema_files = list((ROOT / "schemas").rglob("*.json"))
    bad_schema = []
    for s in schema_files:
        try:
            json.loads(s.read_text(encoding="utf-8"))
        except Exception:
            bad_schema.append(s.name)
    add("schemas parse as JSON", bool(schema_files) and not bad_schema, f"{len(schema_files)} schemas, {len(bad_schema)} bad")

    dp = ROOT / "remotion-composer" / "public" / "demo-props"
    props = list(dp.glob("*.json")) if dp.is_dir() else []
    bad_props = []
    for p in props:
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(d.get("cuts"), list) or not d["cuts"]:
                bad_props.append(p.name)
        except Exception:
            bad_props.append(p.name)
    add("demo compositions declare cuts", bool(props) and not bad_props, f"{len(props)} props")

    skills = list((ROOT / "skills").rglob("*.md"))
    no_heading = [s.name for s in skills if not s.read_text(encoding="utf-8", errors="ignore").lstrip().startswith("#")]
    add("skills are well-formed (markdown heading)", bool(skills) and len(no_heading) <= len(skills) * 0.1, f"{len(skills)} skills, {len(no_heading)} malformed")

    tests = list((ROOT / "tests").rglob("*.py"))
    bad_tests = []
    for t in tests:
        try:
            ast.parse(t.read_text(encoding="utf-8"))
        except SyntaxError:
            bad_tests.append(t.name)
    add("engine tests AST-parse", bool(tests) and not bad_tests, f"{len(tests)} tests, {len(bad_tests)} bad")

    pds = list((ROOT / "pipeline_defs").glob("*.yaml"))
    add("pipeline manifests present", len(pds) >= 10, f"{len(pds)} pipelines")

    passed = sum(1 for c in checks if c["ok"])
    return {"ok": passed == len(checks), "passed": passed, "total": len(checks), "checks": checks}


# Patterns assembled from fragments so the literal upstream tokens never live in committed source.
_LEGACY_RE = re.compile("|".join(["open" + "montage", "cales" + "thio"]), re.I)
_SECRET_RE = re.compile(r'(api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["\'][A-Za-z0-9_\-]{16,}["\']', re.I)
_SCAN_DIRS = ["lib", "tools", "skills", "schemas", "pipeline_defs", "styles", "packages", "scripts"]
_SCAN_EXT = {".py", ".ts", ".tsx", ".js", ".md", ".json", ".yaml", ".yml"}


def compliance() -> dict:
    """Enforced compliance scan: no legacy source-project branding and no hardcoded secrets
    in committable source. Keeps the merge gate honest about attribution + secret hygiene."""
    legacy: list[str] = []
    secrets: list[str] = []
    scanned = 0
    for d in _SCAN_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for f in base.rglob("*"):
            if not f.is_file() or f.suffix not in _SCAN_EXT or "node_modules" in f.parts:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            scanned += 1
            rel = str(f.relative_to(ROOT))
            if _LEGACY_RE.search(text):
                legacy.append(rel)
            if _SECRET_RE.search(text):
                secrets.append(rel)
    return {
        "ok": not legacy and not secrets,
        "scanned": scanned,
        "legacy_tokens": legacy[:20],
        "hardcoded_secrets": secrets[:20],
    }


NULLARY = {
    "info": info, "verify": verify, "compositions": compositions,
    "providers": providers, "selfcheck": selfcheck, "compliance": compliance,
}


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "info"
    if cmd == "composition":
        if len(argv) < 3:
            print(json.dumps({"ok": False, "error": "composition requires a name"}))
            return 2
        print(json.dumps(composition(argv[2])))
        return 0
    fn = NULLARY.get(cmd)
    if fn is None:
        print(json.dumps({"ok": False, "error": f"unknown command: {cmd}", "commands": sorted([*NULLARY, "composition"])}))
        return 2
    print(json.dumps(fn()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
