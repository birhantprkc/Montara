# Reel Builder

Turn a raw vertical talking clip into a finished Reel in one call: first inspect the source,
then make an editorial choice, then compose motion graphics, optional local captions, a hook,
an end/CTA card, the original audio, and a -14 LUFS loudness pass. Zero API keys: visual
understanding comes from local frame/pacing analysis, captions come from local faster-whisper
when installed, and mastering comes from ffmpeg loudnorm.

```
montara reel input.mp4 out.mp4 --prompt "explain Fable 5 design with this talking-head footage" --style cinematic [--hook TEXT] [--cta TEXT] [--no-captions] [--model base] [--simple]
```

## What it does (the craft layer applied end-to-end)

1. **Watch / understand** - sample frames, scene changes, brightness, colour, size, duration, and
   audio state before deciding the treatment. A source clip is never treated as plain text input.
2. **Editorial plan** - choose what the edit needs: tighter pacing, meaning cards, motion overlays,
   contrast polish, captions, CTA, or a simple pass when the source already carries the edit.
3. **Caption** - if local STT is available, `localTranscribe` (faster-whisper) produces timed
   caption cues. Each cue is word-wrapped and burned at the lower third with a readable box
   (craft rule: text must survive phones). Cue text is written to per-cue files, so punctuation is
   safe in the filtergraph.
4. **Content-aware motion treatment** - infer input kind, requested style, and topic-specific visual
   directives. A game-design prompt should produce systems/UI/progression diagrams; a documentary
   prompt should produce evidence/map/data beats; a talking head stays source-primary.
5. **Hook** - a bold top card with a duration chosen from the source length and style, not a fixed
   universal window.
6. **End card** - only when the user asks for a CTA. Never force brand text.
7. **Master** - `loudnorm` to -14 LUFS / -1 dBTP, original voice kept (craft rule: master once).
8. **QA** - `qaPlayback` re-inspects the finished file (dimensions, audio level, scene variety).

## Editorial rule

Never run a reel as "prompt -> subtitles -> done." The minimum loop is:

```
prompt/source -> watch/understand -> decide what the footage lacks -> compose -> QA playback
```

If the source is a static or slow-cut talking head, add helpful overlays only where they clarify
the topic, and keep the speaker's face primary. If the source already has burned captions, prefer
topic-specific diagrams or safe-zone callouts over duplicate captions.

The command writes three editable artifacts next to the MP4:

- `*.reel-plan.json` - source review, selected style, directives, tools, and provider choices.
- `*.timeline.json` - clean Montara Timeline IR.
- `*.edit-decisions.json` - scene/decision-compatible edit decisions for agents that prefer that shape.

## Programmatic

```ts
import { buildReel } from "@montara/render-ffmpeg";
import { localTranscribe, transcribeAvailable } from "@montara/hear";

const captions = transcribeAvailable()
  ? (localTranscribe("in.mp4")?.segments ?? []).map((s) => ({ startSec: s.start, endSec: s.end, text: s.text }))
  : [];

buildReel("in.mp4", "out.mp4", {
  hook: "WATCH THIS",
  captions,
  lufs: -14,
  smart: true,
  style: { accent: "7dd3fc" },
});
```

## Notes

- Without faster-whisper installed, the reel still builds (understanding + smart motion + hook +
  end card + master). Captions are skipped with a clear message, never faked.
- For tighter captions, transcribe with a larger `--model` (small/medium) and split long cues.
- The source should already be vertical (9:16); the builder preserves the input frame size.
