from __future__ import annotations

import os
import time
from pathlib import Path

from tools.capture.screen_capture_selector import ScreenCaptureSelector


def test_pick_latest_from_recordings_dir_copies_requested_output(tmp_path: Path):
    recordings_dir = tmp_path / "recordings"
    old_dir = recordings_dir / "old" / "output"
    new_dir = recordings_dir / "new" / "output"
    old_dir.mkdir(parents=True)
    new_dir.mkdir(parents=True)

    older = old_dir / "older.mp4"
    newer = new_dir / "newer.mp4"
    older.write_bytes(b"old mp4")
    newer.write_bytes(b"new mp4")
    now = time.time()
    os.utime(older, (now - 10, now - 10))
    os.utime(newer, (now, now))

    output = tmp_path / "picked" / "screen-demo.mp4"
    result = ScreenCaptureSelector().execute({
        "operation": "pick_latest",
        "recordings_dir": str(recordings_dir),
        "output_path": str(output),
        "since_minutes": 60_000,
    })

    assert result.success
    assert output.read_bytes() == b"new mp4"
    assert result.data["output_path"] == str(output)
    assert result.data["original_path"] == str(newer)
    assert result.data["capture_method"] == "local_recording"
    assert result.data["source"] == "recordings_dir"
