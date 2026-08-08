"""SAM 2 worker: promptable object masks, tracked across a shot.

Where RVM answers "person vs background", SAM 2 answers "this specific thing". A click,
a box, or a YOLO detection seeds the first frame and SAM 2 propagates the mask forward -
which is what makes rotoscoping an arbitrary subject practical.

Output is a grayscale matte MP4 aligned frame-for-frame with the source, so the compositor
can consume it exactly like an RVM matte.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.vision.frame_io import (  # noqa: E402
    FrameWriter,
    failure,
    media_bin,
    probe_video,
    resolve_device,
    success,
    unavailable,
)

VARIANT_CONFIGS = {
    "sam2.1-hiera-tiny": ("configs/sam2.1/sam2.1_hiera_t.yaml", "facebook/sam2.1-hiera-tiny"),
    "sam2.1-hiera-small": ("configs/sam2.1/sam2.1_hiera_s.yaml", "facebook/sam2.1-hiera-small"),
    "sam2.1-hiera-base-plus": ("configs/sam2.1/sam2.1_hiera_b+.yaml", "facebook/sam2.1-hiera-base-plus"),
    "sam2.1-hiera-large": ("configs/sam2.1/sam2.1_hiera_l.yaml", "facebook/sam2.1-hiera-large"),
}


def parse_points(raw: str) -> tuple[list[list[float]], list[int]]:
    """"x,y,label;x,y,label" -> coordinates and 1=foreground / 0=background labels."""
    points: list[list[float]] = []
    labels: list[int] = []
    for chunk in filter(None, (part.strip() for part in raw.split(";"))):
        bits = chunk.split(",")
        if len(bits) < 2:
            continue
        points.append([float(bits[0]), float(bits[1])])
        labels.append(int(bits[2]) if len(bits) > 2 else 1)
    return points, labels


def parse_box(raw: str) -> list[float] | None:
    bits = [part.strip() for part in raw.split(",") if part.strip()]
    if len(bits) != 4:
        return None
    return [float(value) for value in bits]


def build_predictor(variant: str, device: str, allow_download: bool):
    """Return (predictor, error). A local checkpoint avoids any network access."""
    from sam2.build_sam import build_sam2_video_predictor
    from sam2.sam2_video_predictor import SAM2VideoPredictor

    config, hf_id = VARIANT_CONFIGS[variant]
    checkpoint = os.environ.get("MONTARA_SAM2_CHECKPOINT")

    if checkpoint:
        if not Path(checkpoint).is_file():
            return None, f"MONTARA_SAM2_CHECKPOINT does not exist: {checkpoint}"
        return build_sam2_video_predictor(config, checkpoint, device=device), ""

    if not allow_download:
        return None, (
            "SAM 2 checkpoint is not present locally and downloading was not approved for this "
            "machine. Set MONTARA_SAM2_CHECKPOINT, or run montara models plan."
        )
    return SAM2VideoPredictor.from_pretrained(hf_id, device=device), ""


def extract_frames(input_path: str, work_dir: Path, max_frames: int) -> int:
    """SAM 2's video predictor indexes a directory of JPEG frames."""
    args = [media_bin("ffmpeg"), "-y", "-v", "error", "-i", input_path]
    if max_frames:
        args += ["-frames:v", str(max_frames)]
    args += ["-q:v", "2", "-start_number", "0", str(work_dir / "%05d.jpg")]
    result = subprocess.run(args, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        return 0
    return len(list(work_dir.glob("*.jpg")))


def main() -> int:
    parser = argparse.ArgumentParser(description="SAM 2 promptable segmentation")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-matte", required=True, help="grayscale mask MP4")
    parser.add_argument("--variant", default="sam2.1-hiera-tiny")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--points", default="", help='"x,y,label;x,y,label" in source pixels')
    parser.add_argument("--box", default="", help='"x1,y1,x2,y2" in source pixels')
    parser.add_argument("--obj-id", type=int, default=1)
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()

    if not Path(args.input).is_file():
        return failure(f"input not found: {args.input}")
    if args.variant not in VARIANT_CONFIGS:
        return failure(f"unknown SAM 2 variant {args.variant}")

    points, labels = parse_points(args.points)
    box = parse_box(args.box) if args.box else None
    if not points and box is None:
        return failure("SAM 2 needs a prompt: pass --points or --box")

    try:
        import numpy as np
        import torch  # noqa: F401
    except ImportError as exc:
        return unavailable(f"SAM 2 needs torch and numpy in this interpreter: {exc}")
    try:
        import sam2  # noqa: F401
    except ImportError as exc:
        return unavailable(f"the sam2 package is not installed in this interpreter: {exc}")

    info = probe_video(args.input)
    if info is None or info.width <= 0:
        return failure(f"could not probe video: {args.input}")

    device = resolve_device(args.device)
    try:
        predictor, error = build_predictor(args.variant, device, args.allow_download)
    except Exception as exc:  # noqa: BLE001 - missing config/weights must degrade
        return unavailable(f"SAM 2 could not be initialised: {exc}", variant=args.variant)
    if predictor is None:
        return unavailable(error, variant=args.variant, device=device)

    work_dir = Path(tempfile.mkdtemp(prefix="montara-sam2-"))
    writer = FrameWriter(args.out_matte, info.width, info.height, info.fps, gray=True)
    tracked = 0

    try:
        frame_count = extract_frames(args.input, work_dir, args.max_frames)
        if frame_count == 0:
            writer.close()
            return failure("ffmpeg produced no frames for SAM 2")

        import torch

        with torch.inference_mode():
            state = predictor.init_state(video_path=str(work_dir))
            if box is not None:
                predictor.add_new_points_or_box(
                    inference_state=state, frame_idx=0, obj_id=args.obj_id,
                    box=np.array(box, dtype=np.float32),
                )
            if points:
                predictor.add_new_points_or_box(
                    inference_state=state, frame_idx=0, obj_id=args.obj_id,
                    points=np.array(points, dtype=np.float32),
                    labels=np.array(labels, dtype=np.int32),
                )

            masks_by_frame: dict[int, "np.ndarray"] = {}
            for frame_idx, obj_ids, mask_logits in predictor.propagate_in_video(state):
                if args.obj_id in obj_ids:
                    channel = list(obj_ids).index(args.obj_id)
                else:
                    channel = 0
                mask = (mask_logits[channel] > 0).squeeze().cpu().numpy()
                masks_by_frame[frame_idx] = mask

        blank = np.zeros((info.height, info.width), dtype=np.uint8)
        for frame_idx in range(frame_count):
            mask = masks_by_frame.get(frame_idx)
            if mask is None:
                writer.write(blank)
                continue
            alpha = (mask.astype(np.uint8) * 255)
            if alpha.shape != (info.height, info.width):
                alpha = resize_nearest(alpha, info.width, info.height)
            writer.write(alpha)
            tracked += 1
    except Exception as exc:  # noqa: BLE001 - degrade rather than break the render
        writer.close()
        shutil.rmtree(work_dir, ignore_errors=True)
        return unavailable(f"SAM 2 propagation failed: {exc}", variant=args.variant, device=device)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    ok, err = writer.close()
    if not ok:
        return failure(f"mask encode failed: {err}")

    return success(
        {
            "input": args.input,
            "variant": args.variant,
            "device": device,
            "frames_tracked": tracked,
            "width": info.width,
            "height": info.height,
            "fps": round(info.fps, 3),
            "prompt": {"points": points, "labels": labels, "box": box},
            "matte": args.out_matte,
        },
        [args.out_matte],
    )


def resize_nearest(mask, width: int, height: int):
    """Nearest-neighbour resize without pulling in OpenCV; masks are binary anyway."""
    import numpy as np

    src_h, src_w = mask.shape[:2]
    ys = (np.arange(height) * src_h // max(1, height)).clip(0, src_h - 1)
    xs = (np.arange(width) * src_w // max(1, width)).clip(0, src_w - 1)
    return mask[ys][:, xs]


if __name__ == "__main__":
    raise SystemExit(main())
