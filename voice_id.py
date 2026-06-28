"""Montara voice-ID — speaker differentiation via Resemblyzer embeddings.

Extracts a 256-d speaker "fingerprint" from short reference clips and compares a new clip
to them with cosine similarity. This is the "is this voice closer to speaker A or B?" tool
(e.g. Salman vs SRK): supply clean reference clips per speaker, then classify new audio.

Heavy (imports torch via Resemblyzer), so it runs as a standalone tool — never inside the
verify/validate gates. JSON in, JSON out.

Usage:
    python voice_id.py embed   <wav>
    python voice_id.py verify  <a.wav> <b.wav> [threshold]
    python voice_id.py compare <test.wav> <labelA> <refA.wav> <labelB> <refB.wav> [...]
"""
import json
import sys

import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav

_encoder = None


def encoder() -> "VoiceEncoder":
    global _encoder
    if _encoder is None:
        _encoder = VoiceEncoder(verbose=False)
    return _encoder


def embed(path: str) -> np.ndarray:
    return encoder().embed_utterance(preprocess_wav(path))


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def cmd_compare(test: str, refs: list[tuple[str, str]]) -> dict:
    te = embed(test)
    scores = {label: round(cosine(te, embed(path)), 4) for label, path in refs}
    match = max(scores, key=scores.get)
    ordered = sorted(scores.values(), reverse=True)
    margin = round(ordered[0] - ordered[1], 4) if len(ordered) > 1 else 1.0
    return {"ok": True, "match": match, "scores": scores, "margin": margin}


def cmd_verify(a: str, b: str, threshold: float = 0.75) -> dict:
    sim = cosine(embed(a), embed(b))
    return {"ok": True, "similarity": round(sim, 4), "same_speaker": sim >= threshold, "threshold": threshold}


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "embed" and len(argv) >= 3:
        e = embed(argv[2])
        print(json.dumps({"ok": True, "dim": int(e.shape[0]), "head": [round(float(x), 6) for x in e[:8]]}))
        return 0
    if cmd == "verify" and len(argv) >= 4:
        thr = float(argv[4]) if len(argv) > 4 else 0.75
        print(json.dumps(cmd_verify(argv[2], argv[3], thr)))
        return 0
    if cmd == "compare" and len(argv) >= 6:
        test, rest = argv[2], argv[3:]
        refs = [(rest[i], rest[i + 1]) for i in range(0, len(rest) - 1, 2)]
        print(json.dumps(cmd_compare(test, refs)))
        return 0
    print(json.dumps({"ok": False, "error": "usage: embed <wav> | verify <a> <b> [thr] | compare <test> <labelA> <refA> <labelB> <refB>"}))
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
