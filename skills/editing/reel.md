# Reel Builder

Turn a raw vertical talking clip into a finished Reel in one call: local auto-captions, a hook card,
an end/CTA card, the original audio kept, and a −14 LUFS loudness pass. Zero API keys — captions come
from local faster-whisper, mastering from ffmpeg loudnorm.

```
montara reel input.mp4 out.mp4 --hook "DON'T SCROLL" --cta "FOLLOW @handle" [--no-captions] [--model base]
```

## What it does (the craft layer applied end-to-end)

1. **Understand** — `qaPlayback` probes size/duration; if local STT is available, `localTranscribe`
   (faster-whisper) produces timed caption cues.
2. **Caption** — each cue is word-wrapped and burned at the lower third with a readable box
   (craft rule: text must survive phones). Cue text is written to per-cue files, so any punctuation
   is safe in the filtergraph.
3. **Hook** — a bold top card for the first ~2.6s (craft rule: the first second must grab).
4. **End card** — a CTA over the last ~3s.
5. **Master** — `loudnorm` to −14 LUFS / −1 dBTP, original voice kept (craft rule: master once).
6. **QA** — `qaPlayback` re-inspects the finished file (dimensions, audio level, scene variety).

## Programmatic

```ts
import { buildReel } from "@montara/render-ffmpeg";
import { localTranscribe, transcribeAvailable } from "@montara/hear";

const captions = transcribeAvailable() ? (localTranscribe("in.mp4")?.segments ?? []).map((s) => ({ startSec: s.start, endSec: s.end, text: s.text })) : [];
buildReel("in.mp4", "out.mp4", { hook: "WATCH THIS", endCard: "FOLLOW FOR MORE", captions, lufs: -14 });
```

## Notes

- Without faster-whisper installed, the reel still builds (hook + end card + master) — captions are
  skipped with a clear message, never faked.
- For tighter captions, transcribe with a larger `--model` (small/medium) and split long cues.
- The source should already be vertical (9:16); the builder preserves the input frame size.
