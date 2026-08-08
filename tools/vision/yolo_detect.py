"""YOLO11 worker: what is in the shot, and where.

Detections do two jobs here. They seed SAM 2 with a box so masking needs no manual click,
and they drive auto-framing so a reframe or punch-in follows the real subject instead of a
guessed centre crop.

Ultralytics is AGPL-3.0. Commercial use requires a licence from Ultralytics; the weights
are external assets and are never committed to this repo.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.vision.frame_io import (  # noqa: E402
    failure,
    probe_video,
    resolve_device,
    success,
    unavailable,
)


def resolve_weights(variant: str, allow_download: bool) -> tuple[str, str]:
    """Return (weights, error). A configured local file always wins over a download."""
    configured = os.environ.get("MONTARA_YOLO_WEIGHTS")
    if configured:
        if not Path(configured).is_file():
            return "", f"MONTARA_YOLO_WEIGHTS does not exist: {configured}"
        return configured, ""

    filename = f"{variant}.pt"
    if Path(filename).is_file():
        return filename, ""
    if allow_download:
        return filename, ""
    return "", (
        f"{filename} is not present locally and downloading was not approved for this machine. "
        "Set MONTARA_YOLO_WEIGHTS, or run montara models plan."
    )


def subject_box(detections: list[dict], width: int, height: int) -> dict | None:
    """
    Pick the box a viewer would call "the subject": prefer people, then the largest
    detection, breaking ties toward frame centre so a bystander at the edge does not win.
    """
    if not detections:
        return None
    people = [d for d in detections if d["label"] == "person"]
    pool = people or detections
    cx, cy = width / 2, height / 2

    def score(det: dict) -> float:
        x1, y1, x2, y2 = det["box"]
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        dx = ((x1 + x2) / 2 - cx) / max(1.0, width)
        dy = ((y1 + y2) / 2 - cy) / max(1.0, height)
        centrality = 1.0 - min(1.0, (dx * dx + dy * dy) ** 0.5)
        return area * (0.6 + 0.4 * centrality)

    best = max(pool, key=score)
    return {"label": best["label"], "box": best["box"], "confidence": best["confidence"]}


def main() -> int:
    parser = argparse.ArgumentParser(description="YOLO11 detection")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--variant", default="yolo11n")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--conf", type=float, default=0.35)
    parser.add_argument("--stride", type=int, default=5, help="detect every Nth frame")
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--classes", default="", help="comma-separated class names to keep")
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()

    if not Path(args.input).is_file():
        return failure(f"input not found: {args.input}")

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        return unavailable(f"ultralytics is not installed in this interpreter: {exc}")

    weights, error = resolve_weights(args.variant, args.allow_download)
    if not weights:
        return unavailable(error, variant=args.variant)

    info = probe_video(args.input)
    if info is None or info.width <= 0:
        return failure(f"could not probe media: {args.input}")

    device = resolve_device(args.device)
    keep = {name.strip().lower() for name in args.classes.split(",") if name.strip()}

    try:
        model = YOLO(weights)
        results = model.predict(
            source=args.input,
            conf=args.conf,
            device=device,
            stream=True,
            verbose=False,
            vid_stride=max(1, args.stride),
        )

        frames: list[dict] = []
        all_detections: list[dict] = []
        for index, result in enumerate(results):
            if args.max_frames and index >= args.max_frames:
                break
            detections: list[dict] = []
            names = result.names or {}
            for box in result.boxes or []:
                label = str(names.get(int(box.cls[0]), int(box.cls[0]))).lower()
                if keep and label not in keep:
                    continue
                coords = [round(float(value), 2) for value in box.xyxy[0].tolist()]
                detections.append(
                    {"label": label, "box": coords, "confidence": round(float(box.conf[0]), 4)}
                )
            frames.append(
                {
                    "frame": index * max(1, args.stride),
                    "timeSec": round(index * max(1, args.stride) / max(1e-6, info.fps), 3),
                    "detections": detections,
                }
            )
            all_detections.extend(detections)
    except Exception as exc:  # noqa: BLE001 - detection is an enrichment, never a blocker
        return unavailable(f"YOLO inference failed: {exc}", variant=args.variant, device=device)

    payload = {
        "input": args.input,
        "variant": args.variant,
        "device": device,
        "width": info.width,
        "height": info.height,
        "fps": round(info.fps, 3),
        "stride": max(1, args.stride),
        "frames": frames,
        "subject": subject_box(all_detections, info.width, info.height),
        "labels": sorted({det["label"] for det in all_detections}),
        "license": "Ultralytics YOLO is AGPL-3.0; commercial use requires a licence.",
    }
    Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out_json).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return success(
        {
            "input": args.input,
            "variant": args.variant,
            "device": device,
            "framesAnalyzed": len(frames),
            "detections": len(all_detections),
            "subject": payload["subject"],
            "labels": payload["labels"],
        },
        [args.out_json],
    )


if __name__ == "__main__":
    raise SystemExit(main())
