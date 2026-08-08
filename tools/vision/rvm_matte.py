"""Robust Video Matting worker: video in, temporally coherent alpha matte out.

This is the green-screen-free path. RVM is recurrent: it carries hidden state between
frames, which is what stops the matte from flickering the way per-frame background
removal does. We therefore stream frames strictly in order and never batch out of order.

The caller (``@montara/vision``) has already cleared the hardware gate and picked a
variant. This worker refuses to fetch weights unless ``--allow-download`` says the gate
approved it.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.vision.frame_io import (  # noqa: E402
    FrameWriter,
    failure,
    probe_video,
    read_frames,
    resolve_device,
    success,
    unavailable,
)

VARIANT_BACKBONES = {
    "rvm-mobilenetv3": "mobilenetv3",
    "rvm-resnet50": "resnet50",
}


def load_model(variant: str, device: str, allow_download: bool):
    """Return (model, error). Local clone wins; the hub is only used when approved."""
    import torch

    backbone = VARIANT_BACKBONES.get(variant)
    if backbone is None:
        return None, f"unknown RVM variant {variant}"

    local_repo = os.environ.get("MONTARA_RVM_REPO")
    checkpoint = os.environ.get("MONTARA_RVM_CHECKPOINT")

    model = None
    if local_repo and Path(local_repo).is_dir():
        model = torch.hub.load(local_repo, backbone, source="local", pretrained=not checkpoint)
    elif allow_download:
        model = torch.hub.load(
            "PeterL1n/RobustVideoMatting",
            backbone,
            pretrained=not checkpoint,
            trust_repo=True,
        )
    else:
        return None, (
            "RVM weights are not present locally and downloading was not approved for this "
            "machine. Set MONTARA_RVM_REPO to a local clone, or run montara models plan."
        )

    if checkpoint:
        if not Path(checkpoint).is_file():
            return None, f"MONTARA_RVM_CHECKPOINT does not exist: {checkpoint}"
        model.load_state_dict(torch.load(checkpoint, map_location="cpu"))

    model = model.eval().to(device)
    if device == "cuda":
        model = model.half()
    return model, ""


def auto_downsample_ratio(width: int, height: int) -> float:
    """RVM wants its internal pass near 512px on the long edge."""
    longest = max(width, height)
    if longest <= 512:
        return 1.0
    return round(512 / longest, 4)


def work_size(width: int, height: int, max_width: int) -> tuple[int, int]:
    """Cap the decode size. A 4K matte costs 25 MB per frame on the pipe and buys nothing:
    the compositor rescales the matte to the layer box anyway, and a slightly soft alpha
    edge composites better than a hard one."""
    if max_width <= 0 or width <= max_width:
        return width, height
    scaled = int(round(height * max_width / width))
    return max_width - (max_width % 2), scaled - (scaled % 2)


def main() -> int:
    parser = argparse.ArgumentParser(description="RVM background matting")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-matte", required=True, help="grayscale alpha matte MP4")
    parser.add_argument("--out-foreground", default="", help="optional RGB foreground MP4")
    parser.add_argument("--variant", default="rvm-mobilenetv3")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--downsample-ratio", type=float, default=0.0)
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--max-width", type=int, default=1920, help="cap the matte width; 0 keeps source size")
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()

    if not Path(args.input).is_file():
        return failure(f"input not found: {args.input}")

    try:
        import numpy as np
        import torch
    except ImportError as exc:
        return unavailable(f"RVM needs torch and numpy in this interpreter: {exc}")

    info = probe_video(args.input)
    if info is None or info.width <= 0 or info.height <= 0:
        return failure(f"could not probe video: {args.input}")

    device = resolve_device(args.device)
    model, error = load_model(args.variant, device, args.allow_download)
    if model is None:
        return unavailable(error, variant=args.variant, device=device)

    work_w, work_h = work_size(info.width, info.height, args.max_width)
    ratio = args.downsample_ratio or auto_downsample_ratio(work_w, work_h)
    matte = FrameWriter(args.out_matte, work_w, work_h, info.fps, gray=True)
    foreground = (
        FrameWriter(args.out_foreground, work_w, work_h, info.fps)
        if args.out_foreground
        else None
    )

    rec = [None] * 4
    processed = 0
    dtype = torch.float16 if device == "cuda" else torch.float32

    try:
        with torch.no_grad():
            for frame in read_frames(args.input, work_w, work_h, args.max_frames):
                src = torch.from_numpy(frame.copy()).to(device)
                src = src.permute(2, 0, 1).unsqueeze(0).to(dtype).div(255.0)
                fgr, pha, *rec = model(src, *rec, ratio)
                alpha = pha[0, 0].clamp(0, 1).mul(255).to(torch.uint8).cpu().numpy()
                matte.write(alpha)
                if foreground is not None:
                    rgb = fgr[0].clamp(0, 1).mul(255).to(torch.uint8).permute(1, 2, 0).cpu().numpy()
                    foreground.write(np.ascontiguousarray(rgb))
                processed += 1
    except Exception as exc:  # noqa: BLE001 - a model failure must degrade, not crash the run
        matte.close()
        if foreground is not None:
            foreground.close()
        return unavailable(f"RVM inference failed: {exc}", variant=args.variant, device=device)

    matte_ok, matte_err = matte.close()
    fg_ok, fg_err = foreground.close() if foreground is not None else (True, "")
    if not matte_ok:
        return failure(f"matte encode failed: {matte_err}")
    if not fg_ok:
        return failure(f"foreground encode failed: {fg_err}")
    if processed == 0:
        return failure("no frames were decoded from the input")

    artifacts = [args.out_matte] + ([args.out_foreground] if foreground is not None else [])
    return success(
        {
            "input": args.input,
            "variant": args.variant,
            "device": device,
            "frames": processed,
            "width": work_w,
            "height": work_h,
            "sourceWidth": info.width,
            "sourceHeight": info.height,
            "fps": round(info.fps, 3),
            "downsample_ratio": ratio,
            "matte": args.out_matte,
            "foreground": args.out_foreground or None,
        },
        artifacts,
    )


if __name__ == "__main__":
    raise SystemExit(main())
