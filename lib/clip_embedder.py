"""CLIP embedder: thin wrapper around openai/clip-vit-base-patch32 for
corpus indexing and text-to-visual similarity ranking.

Design notes
------------
This module intentionally does ONE thing: turn images and text into
normalised 512-d float32 vectors that can be cosine-compared.

- Single shared model instance, lazy-loaded on first call, so the 350 MB
  weights only load once per process regardless of how many places in
  the codebase embed something.
- CPU by default, GPU if available. The ViT-B/32 variant runs at
  ~150-300 ms per image on a modern CPU — fast enough for corpora of
  a few hundred candidates without needing FAISS.
- Output vectors are L2-normalised so cosine similarity reduces to a
  dot product — downstream code can `embeddings @ query_vec.T` and
  interpret it as cosine similarity directly.
- Batched at the caller's request count; no internal mini-batching.
  For corpora > a few hundred items, the caller should chunk.

This file does NOT decide what to embed or how to use the embeddings.
That intelligence lives in the corpus manager and retrieval skills.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence, Union

import numpy as np
import re

# Import heavy deps lazily inside methods so importing this module does
# not pull torch/transformers unless someone actually uses it.


_MODEL = None
_PROCESSOR = None
_DEVICE: str = "cpu"
_MODEL_ID = "openai/clip-vit-base-patch32"
_FALLBACK = False
_FALLBACK_REASON = ""


def _load() -> None:
    """Load CLIP model and processor exactly once per process."""
    global _MODEL, _PROCESSOR, _DEVICE, _FALLBACK, _FALLBACK_REASON
    if _MODEL is not None or _FALLBACK:
        return
    try:
        import torch  # type: ignore
        from transformers import CLIPModel, CLIPProcessor  # type: ignore

        _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        _PROCESSOR = CLIPProcessor.from_pretrained(_MODEL_ID)
        _MODEL = CLIPModel.from_pretrained(_MODEL_ID).to(_DEVICE)
        _MODEL.eval()
    except Exception as exc:
        # Local-first guarantee: corpus search should still work in a fresh
        # checkout with no transformer weights. The fallback mirrors the TS
        # CLIP-shaped embedder: deterministic 512-d token hashing.
        _DEVICE = "cpu-fallback"
        _MODEL = None
        _PROCESSOR = None
        _FALLBACK = True
        _FALLBACK_REASON = f"{type(exc).__name__}: {exc}"


def model_info() -> dict:
    """Return metadata about the loaded model (for index provenance)."""
    return {
        "model_id": _MODEL_ID,
        "device": _DEVICE,
        "dim": 512,
        "fallback": _FALLBACK,
        "fallback_reason": _FALLBACK_REASON,
    }


def _fnv1a(text: str, seed: int = 2166136261) -> int:
    h = seed & 0xFFFFFFFF
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _tokenize(text: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", text.lower()) if token]


def _l2(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    if norm < 1e-8:
        return np.zeros_like(vector, dtype=np.float32)
    return (vector / norm).astype(np.float32, copy=False)


def _embed_tokens(tokens: Sequence[str], salt: str) -> np.ndarray:
    vector = np.zeros(512, dtype=np.float32)
    for token in tokens:
        h = _fnv1a(f"{salt}:{token}")
        idx = h % 512
        sign = 1.0 if (h & 1) == 0 else -1.0
        vector[idx] += sign
    return _l2(vector)


def _fallback_texts(texts: Sequence[str]) -> np.ndarray:
    rows = []
    for text in texts:
        safe = text if text and text.strip() else "untitled"
        tokens = _tokenize(safe)[:77] or ["untitled"]
        rows.append(_embed_tokens(tokens, "text"))
    return np.vstack(rows).astype(np.float32, copy=False) if rows else np.zeros((0, 512), dtype=np.float32)


def _fallback_images(image_paths: Sequence[Union[str, Path]]) -> np.ndarray:
    rows = []
    for path in image_paths:
        p = Path(path)
        chunks = [str(p)]
        if p.is_file():
            try:
                data = p.read_bytes()
                chunks.extend(data[i:i + 64].decode("latin-1", errors="ignore") for i in range(0, len(data), 64))
            except Exception:
                chunks.extend(_tokenize(str(p)))
        rows.append(_embed_tokens(chunks, "image"))
    return np.vstack(rows).astype(np.float32, copy=False) if rows else np.zeros((0, 512), dtype=np.float32)


def embed_images(image_paths: Sequence[Union[str, Path]]) -> np.ndarray:
    """Embed a list of image files into a (N, 512) float32 matrix.

    Each row is L2-normalised.
    """
    if not image_paths:
        return np.zeros((0, 512), dtype=np.float32)

    _load()
    if _FALLBACK:
        return _fallback_images(image_paths)

    import torch  # type: ignore
    from PIL import Image  # type: ignore

    assert _MODEL is not None and _PROCESSOR is not None

    images = []
    for p in image_paths:
        img = Image.open(str(p)).convert("RGB")
        images.append(img)

    inputs = _PROCESSOR(images=images, return_tensors="pt").to(_DEVICE)
    with torch.no_grad():
        features = _MODEL.get_image_features(**inputs)
    features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    arr = features.cpu().numpy().astype(np.float32, copy=False)
    # Close PIL handles to avoid leaking file handles on Windows
    for img in images:
        img.close()
    return arr


def embed_texts(texts: Sequence[str]) -> np.ndarray:
    """Embed a list of text strings into a (N, 512) float32 matrix.

    Each row is L2-normalised.
    """
    if not texts:
        return np.zeros((0, 512), dtype=np.float32)

    _load()
    if _FALLBACK:
        return _fallback_texts(texts)

    import torch  # type: ignore

    assert _MODEL is not None and _PROCESSOR is not None

    # Empty strings break the processor — substitute a placeholder so
    # the alignment with caller indices stays intact.
    safe_texts = [t if t and t.strip() else "untitled" for t in texts]

    inputs = _PROCESSOR(
        text=safe_texts,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=77,
    ).to(_DEVICE)
    with torch.no_grad():
        features = _MODEL.get_text_features(**inputs)
    features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-8)
    return features.cpu().numpy().astype(np.float32, copy=False)


def pool_frames(frame_embeddings: np.ndarray) -> np.ndarray:
    """Average a (K, 512) stack of frame embeddings into a (512,) clip vector.

    Re-normalises after the mean. This is the simplest temporal pooling
    that still respects the L2 assumption the rest of the pipeline makes.
    """
    if frame_embeddings.size == 0:
        return np.zeros(512, dtype=np.float32)
    mean = frame_embeddings.mean(axis=0)
    norm = np.linalg.norm(mean)
    if norm < 1e-8:
        return np.zeros(512, dtype=np.float32)
    return (mean / norm).astype(np.float32, copy=False)
