"""Raw frame streaming between ffmpeg and the vision workers.

Models here are frame-in/frame-out, so we pipe rawvideo through ffmpeg rather than
depending on PyAV or OpenCV. ffmpeg is already a hard requirement for Montara, which
keeps the extra dependency surface for matting/segmentation down to torch + numpy.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator


def media_bin(name: str) -> str:
    """Resolve ffmpeg/ffprobe the same way the TypeScript mediaBin helper does."""
    override = os.environ.get(f"MONTARA_{name.upper()}")
    if override:
        return override
    return shutil.which(name) or name


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    frames: int
    duration: float
    has_audio: bool


def probe_video(path: str | Path) -> VideoInfo | None:
    """Read stream geometry with ffprobe. Returns None when the file is unreadable."""
    result = subprocess.run(
        [
            media_bin("ffprobe"),
            "-v", "error",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        return None
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    streams = payload.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video:
        return None

    num, _, den = str(video.get("avg_frame_rate", "0/1")).partition("/")
    try:
        fps = float(num) / float(den) if float(den or 0) else 0.0
    except (TypeError, ValueError):
        fps = 0.0
    if fps <= 0:
        fps = 25.0

    duration = 0.0
    try:
        duration = float(payload.get("format", {}).get("duration", 0.0))
    except (TypeError, ValueError):
        duration = 0.0

    frames = int(video.get("nb_frames") or 0)
    if frames <= 0 and duration > 0:
        frames = int(round(duration * fps))

    return VideoInfo(
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=fps,
        frames=frames,
        duration=duration,
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
    )


def read_frames(
    path: str | Path,
    width: int,
    height: int,
    max_frames: int = 0,
) -> Iterator["Any"]:
    """Yield HxWx3 uint8 RGB frames decoded by ffmpeg at the requested size."""
    import numpy as np

    args = [
        media_bin("ffmpeg"),
        "-v", "error",
        "-i", str(path),
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-s", f"{width}x{height}",
        "-",
    ]
    frame_bytes = width * height * 3
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    assert proc.stdout is not None
    emitted = 0
    try:
        while True:
            if max_frames and emitted >= max_frames:
                break
            chunk = proc.stdout.read(frame_bytes)
            if not chunk or len(chunk) < frame_bytes:
                break
            yield np.frombuffer(chunk, dtype=np.uint8).reshape(height, width, 3)
            emitted += 1
    finally:
        if proc.stdout:
            proc.stdout.close()
        proc.terminate()
        proc.wait(timeout=30)


class FrameWriter:
    """Encode raw frames to an MP4 via an ffmpeg stdin pipe."""

    def __init__(
        self,
        out_path: str | Path,
        width: int,
        height: int,
        fps: float,
        pix_fmt: str = "rgb24",
        gray: bool = False,
    ) -> None:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        self.width = width
        self.height = height
        self.channels = 1 if gray else 3
        args = [
            media_bin("ffmpeg"),
            "-y",
            "-v", "error",
            "-f", "rawvideo",
            "-pix_fmt", "gray" if gray else pix_fmt,
            "-s", f"{width}x{height}",
            "-r", f"{fps:.6f}",
            "-i", "-",
            "-an",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            "-crf", "18",
            str(out_path),
        ]
        self._proc = subprocess.Popen(args, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame: "Any") -> None:
        assert self._proc.stdin is not None
        self._proc.stdin.write(frame.astype("uint8").tobytes())

    def close(self) -> tuple[bool, str]:
        if self._proc.stdin:
            self._proc.stdin.close()
        stderr = b""
        if self._proc.stderr:
            stderr = self._proc.stderr.read()
        code = self._proc.wait(timeout=300)
        return code == 0, stderr.decode("utf-8", "replace")[-500:]


def emit(payload: dict[str, Any]) -> None:
    """Print the worker result contract and flush, so the caller always gets JSON."""
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    sys.stdout.flush()


def unavailable(reason: str, **data: Any) -> int:
    """Report a missing runtime or checkpoint. Exit code stays 0 so callers degrade."""
    emit({"success": False, "unavailable": True, "error": reason, "data": data, "artifacts": []})
    return 0


def failure(reason: str, **data: Any) -> int:
    emit({"success": False, "unavailable": False, "error": reason, "data": data, "artifacts": []})
    return 1


def success(data: dict[str, Any], artifacts: list[str]) -> int:
    emit({"success": True, "unavailable": False, "error": "", "data": data, "artifacts": artifacts})
    return 0


def resolve_device(requested: str) -> str:
    """Map a requested device onto what torch can actually provide right now."""
    try:
        import torch
    except ImportError:
        return "cpu"
    if requested == "cuda" and torch.cuda.is_available():
        return "cuda"
    if requested == "mps" and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    if requested == "rocm" and torch.cuda.is_available():
        return "cuda"  # ROCm builds of torch expose the CUDA API surface
    return "cpu"
