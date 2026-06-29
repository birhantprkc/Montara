from __future__ import annotations

import json
import subprocess
from pathlib import Path

from tools.base_tool import ToolStatus
from tools.capture.playwright_recorder import PlaywrightRecorder
from tools.tool_registry import ToolRegistry


def test_status_reports_missing_playwright_without_opening_browser(monkeypatch):
    import tools.capture.playwright_recorder as module

    monkeypatch.setattr(module.shutil, "which", lambda name: "node.exe" if name == "node" else "ffmpeg.exe")
    monkeypatch.setattr(module, "_node_has_playwright", lambda: False)

    result = PlaywrightRecorder().execute({"operation": "status"})

    assert result.success
    assert result.data["available"] is False
    assert result.data["playwright_installed"] is False
    assert "npx playwright install chromium" in result.data["install"]


def test_setup_guide_is_available_without_runtime_dependencies(monkeypatch):
    import tools.capture.playwright_recorder as module

    monkeypatch.setattr(module, "_node_has_playwright", lambda: False)

    result = PlaywrightRecorder().execute({"operation": "setup_guide"})

    assert result.success
    assert "npm install -D playwright" in result.data["install_instructions"]


def test_write_script_preserves_auth_state_and_recording_contract(tmp_path):
    tool = PlaywrightRecorder()

    script = tool._write_script(
        {
            "mode": "record",
            "url": "https://example.com",
            "outputPath": str(tmp_path / "out.mp4"),
            "recordingDir": str(tmp_path / "recordings"),
            "authState": str(tmp_path / "auth.json"),
            "durationMs": 250,
            "width": 1280,
            "height": 720,
            "headless": True,
            "actions": [{"kind": "wait", "ms": 100}],
        }
    )

    payload = json.loads((script.parent / "payload.json").read_text(encoding="utf-8"))
    script_text = script.read_text(encoding="utf-8")

    assert payload["authState"].endswith("auth.json")
    assert payload["recordingDir"].endswith("recordings")
    assert "storageState" in script_text
    assert "recordVideo" in script_text
    assert "applyActions" in script_text


def test_raw_video_from_stdout_prefers_reported_video_path(tmp_path):
    recording_dir = tmp_path / "recordings"
    recording_dir.mkdir()
    reported = tmp_path / "reported.webm"
    fallback = recording_dir / "fallback.webm"
    reported.write_bytes(b"webm")
    fallback.write_bytes(b"webm")

    stdout = "\n".join(
        [
            "Log in output that is not JSON",
            json.dumps({"videoPath": str(reported)}),
        ]
    )

    assert PlaywrightRecorder._raw_video_from_stdout(stdout, recording_dir) == reported


def test_raw_video_from_stdout_falls_back_to_latest_recording(tmp_path):
    recording_dir = tmp_path / "recordings"
    nested = recording_dir / "nested"
    nested.mkdir(parents=True)
    older = recording_dir / "older.webm"
    newer = nested / "newer.webm"
    older.write_bytes(b"old")
    newer.write_bytes(b"new")

    older_mtime = 1_000_000
    newer_mtime = 1_000_100
    older.touch()
    newer.touch()
    import os

    os.utime(older, (older_mtime, older_mtime))
    os.utime(newer, (newer_mtime, newer_mtime))

    assert PlaywrightRecorder._raw_video_from_stdout("not-json", recording_dir) == newer


def test_interactive_login_saves_user_auth_state(tmp_path, monkeypatch):
    import tools.capture.playwright_recorder as module

    def fake_run(cmd, capture_output, text, timeout):
        payload_path = Path(cmd[1]).parent / "payload.json"
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        Path(payload["authState"]).write_text('{"cookies":[],"origins":[]}', encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, stdout="saved", stderr="")

    monkeypatch.setattr(PlaywrightRecorder, "get_status", lambda self: ToolStatus.AVAILABLE)
    monkeypatch.setattr(module.subprocess, "run", fake_run)

    auth_state = tmp_path / "auth" / "playwright-auth.json"
    result = PlaywrightRecorder().execute(
        {
            "operation": "interactive_login",
            "url": "https://example.com/dashboard",
            "auth_state_path": str(auth_state),
            "login_timeout_seconds": 1,
        }
    )

    assert result.success
    assert auth_state.exists()
    assert result.data["auth_state_path"] == str(auth_state)
    assert str(auth_state) in result.artifacts


def test_record_transcodes_playwright_webm_to_requested_mp4(tmp_path, monkeypatch):
    import tools.capture.playwright_recorder as module

    def fake_run(cmd, capture_output, text, timeout):
        if Path(cmd[0]).name == "node":
            payload_path = Path(cmd[1]).parent / "payload.json"
            payload = json.loads(payload_path.read_text(encoding="utf-8"))
            raw = Path(payload["recordingDir"]) / "take.webm"
            raw.parent.mkdir(parents=True, exist_ok=True)
            raw.write_bytes(b"webm")
            return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps({"videoPath": str(raw)}), stderr="")
        if Path(cmd[0]).name == "ffmpeg":
            output = Path(cmd[-1])
            output.write_bytes(b"mp4")
            return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
        raise AssertionError(f"unexpected command: {cmd}")

    monkeypatch.setattr(PlaywrightRecorder, "get_status", lambda self: ToolStatus.AVAILABLE)
    monkeypatch.setattr(module.subprocess, "run", fake_run)

    output_path = tmp_path / "captures" / "demo.mp4"
    result = PlaywrightRecorder().execute(
        {
            "operation": "record",
            "url": "https://example.com",
            "output_path": str(output_path),
            "duration_seconds": 0.1,
            "width": 1280,
            "height": 720,
            "actions": [{"kind": "wait", "ms": 100}],
        }
    )

    assert result.success
    assert output_path.exists()
    assert result.data["output_path"] == str(output_path)
    assert result.data["raw_video_path"].endswith("take.webm")
    assert str(output_path) in result.artifacts


def test_registry_discovers_playwright_capture_provider():
    registry = ToolRegistry()
    discovered = registry.discover("tools.capture")

    tool = registry.get("playwright_recorder")

    assert "playwright_recorder" in discovered
    assert tool is not None
    assert tool.capability == "screen_capture"
    assert tool.provider == "playwright"
    assert "interactive_login_storage_state" in tool.capabilities
