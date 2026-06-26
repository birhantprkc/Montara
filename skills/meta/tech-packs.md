# External tech packs

The third knowledge layer: the engines and runtimes Montara drives. These are **invoked**, not
re-implemented — Montara stays a thin, readable system over them. Each pack lists what it provides
and how Montara reaches it.

| Pack | Role in Montara | How it is reached |
|---|---|---|
| **FFmpeg / FFprobe** | Universal assembly, encode, probe, frame sampling, subtitle burn-in. The always-present fallback every adapter degrades to. | Local binaries, resolved by `@montara/render-ffmpeg`. Required (`montara doctor` checks it). |
| **Remotion** | Default composition engine (spring scenes, captions, transitions) once installed/licensed. | `@montara/render-remotion` builds the IR a Remotion tree consumes; degrades to ffmpeg until present. |
| **Revideo (MIT)** | License-safe composition fallback for the same role. | A render adapter behind the IR. |
| **Motion Canvas / three.js / Manim / Blender** | Kinetic typography, 3D, math, pro-3D segments. | Render adapters; the heavier ones shell out to external processes. |
| **transformers.js (ONNX)** | Vision/STT (CLIP, BLIP, Whisper) with no Python. | Swaps in behind `@montara/research` retrieval and analysis. |
| **ComfyUI / A1111** | Local GPU image+video generation, fully offline. | Invoked over a localhost API by the providers layer (BYO runtime). |
| **Local LLM runners** | Ollama / LM Studio / llama.cpp as the optional text brain. | OpenAI-compatible local endpoints; never required for a render. |

Rule: a missing pack **simplifies** output (fewer effects, ffmpeg instead of a fancy renderer); it
never crashes a run.
