"""Capability-level screen capture selector — routes between FFmpeg, Cap, and Playwright.

Presents three options to the agent/user:
  1. FFmpeg (screen_recorder) — ready immediately, CLI-driven, no webcam
  2. Cap (cap_recorder) — needs install, polished UI, webcam overlay, cursor effects
  3. Playwright (playwright_recorder) — browser automation + optional user login

Provider discovery is automatic via the registry (capability="screen_capture").
"""

from __future__ import annotations

from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)


class ScreenCaptureSelector(BaseTool):
    name = "screen_capture_selector"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "screen_capture"
    provider = "selector"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.HYBRID

    agent_skills = ["screen-demo"]

    capabilities = [
        "screen_recording",
        "browser_recording",
        "authenticated_browser_recording",
        "provider_selection",
        "cap_setup_guidance",
    ]

    best_for = [
        "Choosing between quick FFmpeg recording and polished Cap recording",
        "Routing website and SaaS trailer captures to Playwright",
        "Guiding users through screen capture setup",
        "Routing screen-demo pipeline to the right capture tool",
    ]

    not_good_for = [
        "Direct screen recording (use the selected provider instead)",
    ]

    input_schema = {
        "type": "object",
        "required": ["operation"],
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["recommend", "record", "pick_latest"],
                "description": (
                    "'recommend' — assess available options and recommend one, "
                    "'record' — record screen using specified or best provider, "
                    "'pick_latest' — grab the most recent recording from any provider"
                ),
            },
            "preferred_provider": {
                "type": "string",
                "enum": ["auto", "ffmpeg", "cap", "playwright"],
                "default": "auto",
                "description": "Provider preference. 'auto' picks the best available.",
            },
            "url": {
                "type": "string",
                "description": "Browser URL for Playwright capture.",
            },
            "auth_state_path": {
                "type": "string",
                "description": "Optional Playwright storageState file for authenticated browser capture.",
            },
            "output_path": {
                "type": "string",
                "description": "Path for the output MP4 file (required for 'record' operation)",
            },
            "duration_seconds": {
                "type": "integer",
                "default": 60,
                "description": "Recording duration in seconds (FFmpeg only)",
            },
            "fps": {
                "type": "integer",
                "default": 30,
                "description": "Frames per second (FFmpeg only)",
            },
            "capture_audio": {
                "type": "boolean",
                "default": True,
                "description": "Whether to capture audio (FFmpeg only)",
            },
            "region": {
                "type": "object",
                "description": "Screen region to capture (FFmpeg only)",
                "properties": {
                    "x": {"type": "integer"},
                    "y": {"type": "integer"},
                    "width": {"type": "integer"},
                    "height": {"type": "integer"},
                },
            },
            "since_minutes": {
                "type": "integer",
                "default": 5,
                "description": "For pick_latest: look back this many minutes",
            },
        },
    }

    output_schema = {
        "type": "object",
        "properties": {
            "recommended_provider": {"type": "string"},
            "options": {"type": "array"},
            "output_path": {"type": "string"},
            "capture_method": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=64, vram_mb=0, disk_mb=0, network_required=False,
    )

    side_effects = []

    def _providers(self) -> dict[str, BaseTool]:
        """Auto-discover screen_capture providers from the registry."""
        from tools.tool_registry import registry
        registry.ensure_discovered()
        tools = registry.get_by_capability("screen_capture")
        return {t.provider: t for t in tools if t.name != self.name}

    @property
    def fallback_tools(self) -> list[str]:
        return list(self._providers().keys())

    def get_status(self) -> ToolStatus:
        providers = self._providers()
        if any(t.get_status() == ToolStatus.AVAILABLE for t in providers.values()):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        operation = inputs["operation"]

        if operation == "recommend":
            return self._recommend(inputs)
        elif operation == "record":
            return self._record(inputs)
        elif operation == "pick_latest":
            return self._pick_latest(inputs)
        else:
            return ToolResult(
                success=False,
                error=f"Unknown operation: {operation}. Valid: recommend, record, pick_latest",
            )

    def _recommend(self, inputs: dict[str, Any]) -> ToolResult:
        """Assess providers and return a recommendation with tradeoffs."""
        providers = self._providers()

        ffmpeg_tool = providers.get("ffmpeg")
        cap_tool = providers.get("cap")
        playwright_tool = providers.get("playwright")

        options = []

        # FFmpeg option — always available if ffmpeg is installed
        if ffmpeg_tool:
            ffmpeg_status = ffmpeg_tool.get_status()
            options.append({
                "provider": "ffmpeg",
                "tool": "screen_recorder",
                "label": "Quick Recording (FFmpeg)",
                "available": ffmpeg_status == ToolStatus.AVAILABLE,
                "setup_required": ffmpeg_status != ToolStatus.AVAILABLE,
                "strengths": [
                    "Ready immediately — no additional install",
                    "CLI-driven — works in automated pipelines",
                    "Full screen or region capture",
                    "System + microphone audio",
                ],
                "limitations": [
                    "No webcam overlay (picture-in-picture)",
                    "No cursor highlight or click effects",
                    "No built-in editor or captions",
                    "Raw capture — no polish",
                ],
                "best_when": "You need a quick recording or automated capture",
            })

        # Cap option — may need install
        if cap_tool:
            cap_detect = cap_tool.execute({"operation": "detect"})
            cap_installed = cap_detect.data.get("installed", False) if cap_detect.success else False
            cap_running = cap_detect.data.get("running", False) if cap_detect.success else False

            status_label = "Running" if cap_running else ("Installed" if cap_installed else "Not installed")
            options.append({
                "provider": "cap",
                "tool": "cap_recorder",
                "label": "Pro Recording (Cap)",
                "available": cap_installed,
                "running": cap_running,
                "status": status_label,
                "setup_required": not cap_installed,
                "strengths": [
                    "Webcam overlay (picture-in-picture)",
                    "Cursor highlight and click effects",
                    "GPU-accelerated capture",
                    "Built-in editor with auto-captions",
                    "Clean system audio capture",
                    "Polished, professional output",
                ],
                "limitations": [
                    "Requires separate install (~2 min)",
                    "User must interact with Cap's UI to record",
                    "Cannot be fully automated from CLI",
                ],
                "best_when": "You want professional, polished screen recordings",
                "setup_time": "~2 minutes" if not cap_installed else None,
            })

        if playwright_tool:
            playwright_status = playwright_tool.get_status()
            options.append({
                "provider": "playwright",
                "tool": "playwright_recorder",
                "label": "Browser Recording (Playwright)",
                "available": playwright_status == ToolStatus.AVAILABLE,
                "setup_required": playwright_status != ToolStatus.AVAILABLE,
                "strengths": [
                    "Records repeatable browser walkthroughs",
                    "Can reuse a user-approved login storageState",
                    "Works well for SaaS, dashboards, and websites behind auth",
                    "Free/local; no paid capture service required",
                ],
                "limitations": [
                    "Browser only -- not native desktop apps",
                    "Requires Playwright + Chromium install",
                    "User must log in manually for protected sites",
                    "Needs privacy review before publishing authenticated recordings",
                ],
                "best_when": "You need a website or web-app trailer, especially behind a login wall",
                "setup_time": "~2 minutes" if playwright_status != ToolStatus.AVAILABLE else None,
            })

        # Determine recommendation
        preferred = inputs.get("preferred_provider", "auto")
        if preferred in {"cap", "ffmpeg", "playwright"} and any(o["provider"] == preferred for o in options):
            recommended = preferred
        elif inputs.get("url") and any(o["provider"] == "playwright" and o["available"] for o in options):
            recommended = "playwright"
        else:
            # Auto: recommend Cap if installed+running, otherwise FFmpeg
            cap_option = next((o for o in options if o["provider"] == "cap"), None)
            if cap_option and cap_option.get("running"):
                recommended = "cap"
            elif any(o["provider"] == "ffmpeg" and o["available"] for o in options):
                recommended = "ffmpeg"
            elif cap_option and cap_option.get("available"):
                recommended = "cap"
            else:
                recommended = "ffmpeg"

        return ToolResult(
            success=True,
            data={
                "recommended_provider": recommended,
                "options": options,
                "message": self._build_recommendation_message(recommended, options),
            },
        )

    def _build_recommendation_message(self, recommended: str, options: list[dict]) -> str:
        """Build a human-readable recommendation message for the agent to present."""
        cap_option = next((o for o in options if o["provider"] == "cap"), None)
        ffmpeg_option = next((o for o in options if o["provider"] == "ffmpeg"), None)
        playwright_option = next((o for o in options if o["provider"] == "playwright"), None)

        lines = ["**Screen Recording Options:**\n"]

        if ffmpeg_option:
            status = "Ready" if ffmpeg_option["available"] else "Needs FFmpeg install"
            lines.append(f"**Option 1 — Quick Recording (FFmpeg)** [{status}]")
            lines.append("  Basic screen capture, works immediately. No webcam or effects.\n")

        if cap_option:
            status = cap_option.get("status", "Unknown")
            lines.append(f"**Option 2 — Pro Recording (Cap)** [{status}]")
            lines.append("  Webcam overlay, cursor effects, built-in editor. Professional output.")
            if not cap_option.get("available"):
                lines.append("  Setup takes ~2 minutes. I can guide you through it.\n")
            else:
                lines.append("")

        if playwright_option:
            status = "Ready" if playwright_option["available"] else "Needs Playwright install"
            lines.append(f"**Option 3 — Browser Recording (Playwright)** [{status}]")
            lines.append("  Repeatable browser capture with storageState login support.")
            if not playwright_option.get("available"):
                lines.append("  Setup: npm install -D playwright @playwright/test && npx playwright install chromium\n")
            else:
                lines.append("")

        lines.append(f"**Recommended:** {recommended}")
        return "\n".join(lines)

    def _record(self, inputs: dict[str, Any]) -> ToolResult:
        """Route a record request to the appropriate provider."""
        preferred = inputs.get("preferred_provider", "auto")
        providers = self._providers()

        # Determine which provider to use
        if preferred == "cap":
            tool = providers.get("cap")
            if tool:
                # Cap doesn't do the actual recording — it picks up what Cap recorded
                return tool.execute({"operation": "pick_latest", "output_dir": inputs.get("output_path")})
            return ToolResult(success=False, error="Cap provider not found in registry.")

        if preferred == "playwright":
            tool = providers.get("playwright")
            if not tool:
                return ToolResult(success=False, error="Playwright provider not found in registry.")
            return tool.execute({
                "operation": "record",
                "url": inputs.get("url"),
                "output_path": inputs.get("output_path", "recording.mp4"),
                "auth_state_path": inputs.get("auth_state_path"),
                "duration_seconds": inputs.get("duration_seconds", 60),
                "width": inputs.get("width", 1920),
                "height": inputs.get("height", 1080),
            })

        if preferred == "ffmpeg" or preferred == "auto":
            if preferred == "auto" and inputs.get("url"):
                playwright_tool = providers.get("playwright")
                if playwright_tool and playwright_tool.get_status() == ToolStatus.AVAILABLE:
                    return playwright_tool.execute({
                        "operation": "record",
                        "url": inputs.get("url"),
                        "output_path": inputs.get("output_path", "recording.mp4"),
                        "auth_state_path": inputs.get("auth_state_path"),
                        "duration_seconds": inputs.get("duration_seconds", 60),
                        "width": inputs.get("width", 1920),
                        "height": inputs.get("height", 1080),
                    })

            tool = providers.get("ffmpeg")
            if tool and tool.get_status() == ToolStatus.AVAILABLE:
                return tool.execute({
                    "output_path": inputs.get("output_path", "recording.mp4"),
                    "duration_seconds": inputs.get("duration_seconds", 60),
                    "fps": inputs.get("fps", 30),
                    "capture_audio": inputs.get("capture_audio", True),
                    "region": inputs.get("region"),
                })

            # FFmpeg not available — try Cap
            cap_tool = providers.get("cap")
            if cap_tool:
                cap_detect = cap_tool.execute({"operation": "detect"})
                if cap_detect.success and cap_detect.data.get("running"):
                    return cap_tool.execute({
                        "operation": "pick_latest",
                        "output_dir": inputs.get("output_path"),
                    })

            return ToolResult(
                success=False,
                error="No screen capture provider available. Install FFmpeg, Cap, or Playwright.",
            )

        return ToolResult(success=False, error=f"Unknown provider: {preferred}")

    def _pick_latest(self, inputs: dict[str, Any]) -> ToolResult:
        """Try to pick the latest recording from any available provider."""
        providers = self._providers()
        since = inputs.get("since_minutes", 5)

        # Try Cap first (more likely to have user-initiated recordings)
        cap_tool = providers.get("cap")
        if cap_tool:
            result = cap_tool.execute({
                "operation": "find_recordings",
                "since_minutes": since,
            })
            if result.success and result.data.get("recordings"):
                latest = result.data["recordings"][0]
                return ToolResult(
                    success=True,
                    data={
                        "output_path": latest["path"],
                        "size_mb": latest["size_mb"],
                        "capture_method": "cap",
                        "source": "cap_recordings_dir",
                    },
                    artifacts=[latest["path"]],
                )

        return ToolResult(
            success=False,
            error="No recent recordings found. Record something first using Cap or FFmpeg.",
        )
