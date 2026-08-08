"""Report what the *installed* torch build can actually use.

The machine probe in ``@montara/runtimes`` asks vendor tools (nvidia-smi) whether a GPU
exists. That is a different question from whether this Python interpreter can drive it: a
CPU-only torch wheel on a CUDA laptop reports a GPU that no worker can touch, and the gate
would then pick a heavy variant that runs at a crawl on the CPU.

This worker closes that gap. It is deliberately tiny and never downloads anything.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.vision.frame_io import success, unavailable  # noqa: E402


def main() -> int:
    try:
        import torch
    except ImportError as exc:
        return unavailable(f"torch is not installed in {sys.executable}: {exc}")

    cuda = bool(torch.cuda.is_available())
    mps_backend = getattr(torch.backends, "mps", None)
    mps = bool(mps_backend and mps_backend.is_available())

    devices = ["cpu"]
    vram_mb = 0
    name = ""
    if cuda:
        devices.append("cuda")
        try:
            props = torch.cuda.get_device_properties(0)
            vram_mb = int(props.total_memory / (1024 * 1024))
            name = props.name
        except Exception:  # noqa: BLE001 - a naming failure must not sink the probe
            pass
    if mps:
        devices.append("mps")

    return success(
        {
            "interpreter": sys.executable,
            "torch": torch.__version__,
            "devices": devices,
            "cuda": cuda,
            "mps": mps,
            "vramMb": vram_mb,
            "deviceName": name,
        },
        [],
    )


if __name__ == "__main__":
    raise SystemExit(main())
