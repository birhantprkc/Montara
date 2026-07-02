"""Stage 2.8 validate helper: character SVG rig -> HyperFrames final MP4.

The TypeScript validate harness calls this script so the character-animation
proof lives beside the other native-composition proofs. It is runtime-honest:
if HyperFrames is unavailable, it reports that blocker as JSON and exits 0 so
the caller can assert the unavailability was surfaced rather than hidden.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from schemas.artifacts import validate_artifact  # noqa: E402
from tools.character.character_animation import (  # noqa: E402
    ActionTimelineCompiler,
    CharacterRigRenderer,
    CharacterSpecGenerator,
    PoseLibraryBuilder,
    SvgRigBuilder,
)
from tools.video.hyperframes_compose import HyperFramesCompose  # noqa: E402
from tools.video.video_compose import VideoCompose  # noqa: E402


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2))


def main() -> int:
    out_dir = PROJECT_ROOT / "out" / "validate-character-animation"
    out_dir.mkdir(parents=True, exist_ok=True)

    hyperframes = HyperFramesCompose()
    runtime = hyperframes._runtime_check()
    if not runtime.get("runtime_available"):
        emit(
            {
                "success": False,
                "unavailable": True,
                "error": "HyperFrames runtime unavailable for character final MP4",
                "data": {"runtime_check": runtime},
                "artifacts": [],
            }
        )
        return 0

    character_design = CharacterSpecGenerator().execute(
        {
            "characters": [
                {
                    "id": "mouse_lead",
                    "role": "lead",
                    "body_type": "mouse with tail",
                    "required_actions": ["idle", "gesture", "tail_swish"],
                }
            ],
            "style": {
                "visual_style": "flat-motion-graphics",
                "palette": ["#ff8f68", "#75b8ff"],
            },
        }
    ).data["character_design"]
    validate_artifact("character_design", character_design)

    rig_plan = SvgRigBuilder().execute({"character_design": character_design}).data["rig_plan"]
    pose_library = PoseLibraryBuilder().execute({"rig_plan": rig_plan}).data["pose_library"]
    scene_plan = {
        "version": "1.0",
        "scenes": [
            {
                "id": "scene-1",
                "type": "character_scene",
                "description": "Mouse reacts to a tiny surprise.",
                "start_seconds": 0,
                "end_seconds": 1.2,
                "hero_moment": True,
                "character_actions": [
                    {
                        "character_id": "mouse_lead",
                        "emotion": "surprised",
                        "action_sequence": ["anticipate", "perform", "settle"],
                    }
                ],
            }
        ],
    }
    validate_artifact("scene_plan", scene_plan)

    action_timeline = ActionTimelineCompiler().execute(
        {"scene_plan": scene_plan, "character_ids": ["mouse_lead"], "fps": 24}
    ).data["action_timeline"]
    validate_artifact("action_timeline", action_timeline)

    render_result = CharacterRigRenderer().execute(
        {
            "rig_plan": rig_plan,
            "pose_library": pose_library,
            "action_timeline": action_timeline,
            "output_path": str(out_dir / "preview.html"),
            "workspace_path": str(out_dir / "hyperframes"),
        }
    )
    if not render_result.success:
        emit({"success": False, "error": render_result.error, "artifacts": render_result.artifacts})
        return 1

    validate_artifact("asset_manifest", render_result.data["asset_manifest"])
    validate_artifact("edit_decisions", render_result.data["edit_decisions"])
    output_path = out_dir / "final.mp4"
    compose_result = VideoCompose().execute(
        {
            "operation": "render",
            "asset_manifest": render_result.data["asset_manifest"],
            "edit_decisions": render_result.data["edit_decisions"],
            "workspace_path": render_result.data["hyperframes_workspace"],
            "output_path": str(output_path),
            "skip_contrast": True,
            "quality": "draft",
            "fps": 24,
        }
    )
    if not compose_result.success:
        emit(
            {
                "success": False,
                "error": compose_result.error,
                "data": compose_result.data,
                "artifacts": render_result.artifacts,
            }
        )
        return 1

    emit(
        {
            "success": output_path.exists(),
            "data": {
                "output": str(output_path),
                "workspace": render_result.data["hyperframes_workspace"],
                "composition": render_result.data["composition_path"],
            },
            "artifacts": [str(output_path), *render_result.artifacts],
        }
    )
    return 0 if output_path.exists() else 1


if __name__ == "__main__":
    raise SystemExit(main())
