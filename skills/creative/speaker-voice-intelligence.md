# Speaker / Voice Intelligence

Use this when matching speakers, finding dialogue clips, selecting reference voices, or verifying
whether two audio clips belong to the same speaker.

## Backends

Montara reports heavy local backends without importing them during discovery:

```bash
montara voiceid status
```

- Resemblyzer: current local embedding path.
- SpeechBrain ECAPA-TDNN: preferred professional speaker-recognition backend when installed.
- pyannote.audio: diarization and multi-speaker segmentation when installed.

If a backend is missing, do not hard-fail. Continue with available similarity, transcript, and
metadata filters, and state the limitation.

## Corpus Search

For a request such as "find a dialogue clip matching this line and voice," search a local corpus:

```bash
montara voiceid search <query.wav> <corpus.json> --line "requested words"
```

`corpus.json` entries should be:

```json
[{ "id": "clip-1", "speaker": "name", "path": "C:/media/clip.wav", "line": "spoken line" }]
```

The result ranks clips by voice similarity when available plus line-token overlap. Use only clips the
user owns, licensed material, or corpus material they explicitly provided.

## Production Rules

- Isolate voice before embedding when music/noise is present.
- Compare against multiple references for the same target speaker when possible.
- Keep the threshold visible in the decision log.
- Do not claim exact celebrity identity from one noisy clip. Say "closest in this corpus."
- For dialogue replacement or quote usage, preserve rights and attribution constraints.
