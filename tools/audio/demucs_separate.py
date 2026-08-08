#!/usr/bin/env python3
"""Neural source separation for Montara. Uses Demucs (Meta) to split a MIX into stems.

This is the audio counterpart to the vision matte: `matte` separates a picture into subject and
background, this separates a mix into vocals / drums / bass / other. Reach for it when the voice
and the music are already baked into one file — multiband enhance can only polish a single
signal, it cannot unmix one.

Emits JSON {ok, model, samplerate, stems: {name: path}} on stdout. Heavy (torch + model weights);
kept out of the gates and behind an availability probe, like voice_id.py.

Usage: python tools/audio/demucs_separate.py <media> <out_dir> [model] [two_stems]
  model:     htdemucs (default) | htdemucs_ft | mdx_extra | ...
  two_stems: "vocals" collapses the backing stems into one `no_vocals` track
"""
import json
import sys
from pathlib import Path

VENDOR_PACKAGES = Path(__file__).resolve().parents[2] / ".python-packages"
if VENDOR_PACKAGES.exists():
    sys.path.insert(0, str(VENDOR_PACKAGES))


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: tools/audio/demucs_separate.py <media> <out_dir> [model] [two_stems]"}))
        return 2

    media = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    model_name = sys.argv[3] if len(sys.argv) > 3 else "htdemucs"
    two_stems = sys.argv[4] if len(sys.argv) > 4 else None

    if not media.exists():
        print(json.dumps({"error": f"input not found: {media}"}))
        return 1

    try:
        from demucs.api import Separator, save_audio
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"demucs not installed: {exc}"}))
        return 1

    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        # CPU by default so a machine without CUDA still separates; slower, never absent.
        separator = Separator(model=model_name, device="cpu", progress=False)
        _origin, sources = separator.separate_audio_file(media)

        if two_stems:
            keep = sources.get(two_stems)
            if keep is None:
                print(json.dumps({"error": f"unknown stem '{two_stems}'; have {sorted(sources)}"}))
                return 1
            rest = [tensor for name, tensor in sources.items() if name != two_stems]
            accompaniment = rest[0]
            for tensor in rest[1:]:
                accompaniment = accompaniment + tensor
            sources = {two_stems: keep, f"no_{two_stems}": accompaniment}

        written = {}
        for name, tensor in sources.items():
            path = out_dir / f"{name}.wav"
            save_audio(tensor, str(path), samplerate=separator.samplerate)
            written[name] = str(path)

        print(json.dumps({
            "ok": True,
            "model": model_name,
            "samplerate": separator.samplerate,
            "stems": written,
        }))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
