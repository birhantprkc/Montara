"""Playwright browser recorder with an explicit interactive-login path.

This is the free browser-capture route for websites, dashboards, and SaaS
walkthroughs. It records Chromium via Playwright's built-in video capture and
can save/reuse `storageState` after the user logs in manually.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    DependencyError,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)


def _node_has_playwright() -> bool:
    node = shutil.which("node")
    if not node:
        return False
    result = subprocess.run(
        [node, "-e", "require.resolve('playwright'); process.exit(0)"],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


class PlaywrightRecorder(BaseTool):
    name = "playwright_recorder"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "screen_capture"
    provider = "playwright"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = ["cmd:node", "cmd:ffmpeg"]
    install_instructions = (
        "Install Playwright locally: npm install -D playwright @playwright/test "
        "&& npx playwright install chromium. Use operation='setup_guide' for details."
    )
    agent_skills = ["playwright-recording"]

    capabilities = [
        "browser_recording",
        "record_authenticated_site",
        "interactive_login_storage_state",
        "record_mobile_viewport",
    ]
    best_for = [
        "Website and SaaS product trailers",
        "Browser flows behind an authorization wall",
        "Repeatable UI demos where DOM automation is acceptable",
    ]
    not_good_for = [
        "Native desktop apps -- use screen_recorder or cap_recorder",
        "Flows that require hardware devices, browser extensions, or OS dialogs",
        "Recording private user data without an explicit cleanup/redaction pass",
    ]
    fallback_tools = ["screen_recorder", "cap_recorder"]

    input_schema = {
        "type": "object",
        "required": ["operation"],
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["status", "setup_guide", "interactive_login", "record"],
            },
            "url": {"type": "string"},
            "output_path": {"type": "string"},
            "auth_state_path": {"type": "string"},
            "duration_seconds": {"type": "number", "default": 20},
            "width": {"type": "integer", "default": 1920},
            "height": {"type": "integer", "default": 1080},
            "headless": {"type": "boolean", "default": True},
            "actions": {
                "type": "array",
                "description": "Optional deterministic actions: click/type/wait/goto steps.",
            },
            "login_timeout_seconds": {"type": "integer", "default": 180},
        },
    }
    output_schema = {
        "type": "object",
        "properties": {
            "available": {"type": "boolean"},
            "output_path": {"type": "string"},
            "auth_state_path": {"type": "string"},
            "recording_dir": {"type": "string"},
        },
    }
    resource_profile = ResourceProfile(cpu_cores=2, ram_mb=1024, vram_mb=0, disk_mb=1000, network_required=True)
    side_effects = ["creates_file", "opens_browser"]
    user_visible_verification = [
        "Output video exists and ffprobe can read it",
        "For authenticated sites, auth_state_path exists and is not committed",
        "Recording reviewed for private data before publishing",
    ]

    def check_dependencies(self) -> None:
        super().check_dependencies()
        if not _node_has_playwright():
            raise DependencyError(self.install_instructions)

    def get_status(self) -> ToolStatus:
        try:
            self.check_dependencies()
            return ToolStatus.AVAILABLE
        except DependencyError:
            return ToolStatus.UNAVAILABLE

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        operation = inputs["operation"]
        if operation == "status":
            return ToolResult(
                success=True,
                data={
                    "available": self.get_status() == ToolStatus.AVAILABLE,
                    "node": shutil.which("node"),
                    "playwright_installed": _node_has_playwright(),
                    "install": self.install_instructions,
                },
            )
        if operation == "setup_guide":
            return ToolResult(success=True, data={"install_instructions": self.install_instructions})
        if self.get_status() != ToolStatus.AVAILABLE:
            return ToolResult(success=False, error=self.install_instructions)
        if operation == "interactive_login":
            return self._interactive_login(inputs)
        if operation == "record":
            return self._record(inputs)
        return ToolResult(success=False, error=f"Unknown operation: {operation}")

    def _interactive_login(self, inputs: dict[str, Any]) -> ToolResult:
        url = inputs.get("url")
        if not url:
            return ToolResult(success=False, error="interactive_login requires url")
        auth_state = Path(inputs.get("auth_state_path", "projects/auth/playwright-auth.json"))
        auth_state.parent.mkdir(parents=True, exist_ok=True)
        timeout_ms = int(inputs.get("login_timeout_seconds", 180)) * 1000
        script = self._write_script(
            {
                "mode": "login",
                "url": url,
                "authState": str(auth_state.resolve()),
                "timeoutMs": timeout_ms,
                "width": int(inputs.get("width", 1920)),
                "height": int(inputs.get("height", 1080)),
            }
        )
        result = subprocess.run(["node", str(script)], capture_output=True, text=True, timeout=(timeout_ms // 1000) + 30)
        if result.returncode != 0 or not auth_state.exists():
            return ToolResult(success=False, error=(result.stderr or result.stdout or "login did not save auth state")[-700:])
        return ToolResult(success=True, data={"auth_state_path": str(auth_state), "url": url}, artifacts=[str(auth_state)])

    def _record(self, inputs: dict[str, Any]) -> ToolResult:
        url = inputs.get("url")
        output_path = Path(inputs.get("output_path", "projects/browser-recording.mp4"))
        if not url:
            return ToolResult(success=False, error="record requires url")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        recording_dir = Path(tempfile.mkdtemp(prefix="montara-playwright-recording-"))
        payload = {
            "mode": "record",
            "url": url,
            "outputPath": str(output_path.resolve()),
            "recordingDir": str(recording_dir.resolve()),
            "authState": inputs.get("auth_state_path"),
            "durationMs": int(float(inputs.get("duration_seconds", 20)) * 1000),
            "width": int(inputs.get("width", 1920)),
            "height": int(inputs.get("height", 1080)),
            "headless": bool(inputs.get("headless", True)),
            "actions": inputs.get("actions", []),
        }
        script = self._write_script(payload)
        result = subprocess.run(["node", str(script)], capture_output=True, text=True, timeout=(payload["durationMs"] // 1000) + 120)
        if result.returncode != 0:
            return ToolResult(success=False, error=(result.stderr or result.stdout or "recording failed")[-700:])
        raw_video = self._raw_video_from_stdout(result.stdout, recording_dir)
        if not raw_video:
            return ToolResult(success=False, error="Playwright finished but did not report a raw recording path")
        transcode = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(raw_video),
                "-movflags",
                "+faststart",
                "-pix_fmt",
                "yuv420p",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if transcode.returncode != 0 or not output_path.exists():
            return ToolResult(success=False, error=(transcode.stderr or transcode.stdout or "ffmpeg transcode failed")[-700:])
        return ToolResult(
            success=True,
            data={
                "output_path": str(output_path),
                "recording_dir": str(recording_dir),
                "raw_video_path": str(raw_video),
                "url": url,
            },
            artifacts=[str(output_path)],
        )

    @staticmethod
    def _raw_video_from_stdout(stdout: str, recording_dir: Path) -> Path | None:
        for line in reversed(stdout.splitlines()):
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            video_path = payload.get("videoPath")
            if video_path and Path(video_path).exists():
                return Path(video_path)
        candidates = sorted(recording_dir.glob("**/*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0] if candidates else None

    def _write_script(self, payload: dict[str, Any]) -> Path:
        work = Path(tempfile.mkdtemp(prefix="montara-playwright-script-"))
        payload_path = work / "payload.json"
        script_path = work / "record.mjs"
        payload_path.write_text(json.dumps(payload), encoding="utf-8")
        script_path.write_text(_NODE_SCRIPT, encoding="utf-8")
        return script_path


_NODE_SCRIPT = r"""
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(fs.readFileSync(path.join(__dirname, 'payload.json'), 'utf8'));

async function applyActions(page, actions = []) {
  for (const action of actions) {
    if (action.kind === 'goto') await page.goto(action.url, { waitUntil: action.waitUntil || 'networkidle' });
    if (action.kind === 'click') await page.click(action.selector);
    if (action.kind === 'type') await page.fill(action.selector, action.text || '');
    if (action.kind === 'wait') await page.waitForTimeout(action.ms || 1000);
    if (action.kind === 'press') await page.press(action.selector || 'body', action.key || 'Enter');
  }
}

if (payload.mode === 'login') {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: payload.width, height: payload.height } });
  const page = await context.newPage();
  await page.goto(payload.url, { waitUntil: 'domcontentloaded' });
  console.log('Log in in the opened browser. This window will save auth state when the timeout expires.');
  await page.waitForTimeout(payload.timeoutMs);
  await context.storageState({ path: payload.authState });
  await browser.close();
}

if (payload.mode === 'record') {
  const browser = await chromium.launch({ headless: payload.headless });
  const context = await browser.newContext({
    viewport: { width: payload.width, height: payload.height },
    storageState: payload.authState && fs.existsSync(payload.authState) ? payload.authState : undefined,
    recordVideo: { dir: payload.recordingDir, size: { width: payload.width, height: payload.height } },
  });
  const page = await context.newPage();
  await page.goto(payload.url, { waitUntil: 'networkidle' });
  await applyActions(page, payload.actions || []);
  await page.waitForTimeout(payload.durationMs);
  const video = await page.video();
  await context.close();
  await browser.close();
  const videoPath = await video?.path();
  if (!videoPath) throw new Error('Playwright did not produce a video file');
  console.log(JSON.stringify({ videoPath }));
}
"""
