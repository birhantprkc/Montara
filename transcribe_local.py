#!/usr/bin/env python3
"""Local speech-to-text for Montara captions. Uses faster-whisper (CPU, int8) — no API key.
Emits JSON segments [{start, end, text}] on stdout. Heavy (ctranslate2); kept out of the gates.

Usage: python transcribe_local.py <media> [model] [language]
  model: tiny|base|small|medium  (default: base)
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: transcribe_local.py <media> [model] [language]"}))
        return 2
    media = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"faster-whisper not installed: {exc}"}))
        return 1

    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(media, language=language, vad_filter=True)
        out = [
            {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
            for s in segments
            if s.text and s.text.strip()
        ]
        print(json.dumps({"language": info.language, "duration": round(info.duration, 2), "segments": out}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
