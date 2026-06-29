#!/usr/bin/env python3
"""Native HyperFrames validate helper for the TypeScript validate harness.

The harness does the bounded `npx hyperframes --version` probe first. When that
probe succeeds, it passes MONTARA_HYPERFRAMES_VERSION here so the Python tool can
skip the npm registry check and render a strict kinetic-typography smoke MP4.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.video.hyperframes_compose import HyperFramesCompose  # noqa: E402


def _json_result(success: bool, **payload: Any) -> int:
    print(json.dumps({"success": success, **payload}, default=str))
    return 0


def main() -> int:
    try:
        out_dir = ROOT / "out" / "validate-hyperframes"
        if out_dir.exists():
            shutil.rmtree(out_dir)
        workspace = out_dir / "workspace"
        output_path = out_dir / "validate-hyperframes-kinetic.mp4"
        asset_src = out_dir / "assets-src"
        asset_src.mkdir(parents=True, exist_ok=True)
        hero = asset_src / "hero.png"
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=#101820:s=1280x720:d=1",
                "-frames:v",
                "1",
                str(hero),
            ],
            capture_output=True,
            check=True,
            timeout=30,
        )

        result = HyperFramesCompose().execute(
            {
                "operation": "render",
                "workspace_path": str(workspace),
                "output_path": str(output_path),
                "edit_decisions": {
                    "version": "1.0",
                    "renderer_family": "kinetic-typography",
                    "render_runtime": "hyperframes",
                    "metadata": {"title": "Montara HyperFrames kinetic smoke"},
                    "cuts": [
                        {
                            "id": "hero",
                            "source": "hero_asset",
                            "in_seconds": 0,
                            "out_seconds": 1.2,
                            "type": "image",
                        },
                        {
                            "id": "kinetic",
                            "source": "",
                            "in_seconds": 1.2,
                            "out_seconds": 3.4,
                            "type": "kinetic_typography",
                            "text": "KINETIC TYPE",
                            "subtitle": "HTML + GSAP + Timeline handoff",
                        },
                    ],
                },
                "asset_manifest": {
                    "assets": [{"id": "hero_asset", "path": str(hero)}],
                },
                "playbook": {
                    "name": "hyperframes-smoke",
                    "visual_language": {
                        "color_palette": {
                            "background": "#0B1020",
                            "text": "#F8FAFC",
                            "accent": "#12DCE8",
                            "primary": "#E6B44C",
                        }
                    },
                    "typography": {
                        "heading": {"font": "Inter"},
                        "body": {"font": "Inter"},
                    },
                    "motion": {"pace": "fast"},
                },
                "quality": "draft",
                "fps": 30,
                "strict": True,
                "skip_contrast": True,
            }
        )
        return _json_result(
            bool(result.success),
            error=result.error,
            data=result.data or {},
            artifacts=result.artifacts or [],
        )
    except Exception as exc:  # pragma: no cover - harness surface
        return _json_result(False, error=f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
