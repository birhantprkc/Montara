# Provider Audit Notes

Cloud media APIs change frequently. Montara's TypeScript provider registry is
network-free by design: it builds request specs and falls back locally when no
credential is present. That makes tests deterministic, but it does not replace a
live BYOK executor audit before spending user money.

Last checked: 2026-06-30.

## Checked References

- OpenAI image generation: https://platform.openai.com/docs/guides/image-generation
- OpenAI audio speech: https://platform.openai.com/docs/api-reference/audio/createSpeech
- Google Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Google Gemini video generation: https://ai.google.dev/gemini-api/docs/video
- Runway API: https://docs.dev.runwayml.com/api/
- Black Forest Labs API docs: https://docs.bfl.ai/
- ElevenLabs text-to-speech: https://www.elevenlabs.io/docs/api-reference/text-to-speech/convert
- Skills discovery reference: https://www.skills.sh/

## Changes Applied

- OpenAI Images keeps the legacy provider id `dalle3` for compatibility but now
  defaults TypeScript request specs to `gpt-image-2`.
- OpenAI TTS now defaults request specs to `gpt-4o-mini-tts`.
- Black Forest Labs FLUX moved from the older FLUX 1.1 endpoint to
  `flux-2-pro`, with `x-key` auth and `polling_url` in the request spec.
- Google image generation moved to a Gemini image model request shape with
  `responseModalities: ["IMAGE"]`.
- Google Veo moved to the Veo 3.1 long-running model path with typed
  `instances` / `parameters`.
- Runway now emits a versioned `text_to_video` task request with
  `X-Runway-Version` and `promptText`.
- `packages/providers/src/executor.ts` now provides an injectable BYOK executor
  plus request redaction, so CI can replay sanitized HTTP fixtures without live
  keys, network calls, or provider spend.

## Known Follow-Ups

- The TS executor is fixture-tested, not live-key tested. Before spending user
  money, run a real BYOK smoke and save a sanitized fixture.
- Python provider tools need a separate live-shape audit; `tools/graphics/openai_image.py`
  now defaults to GPT Image 2 but still needs a live SDK smoke, and
  `tools/graphics/flux_image.py` still uses the fal.ai path rather than the
  direct BFL registry path.
- Recraft, xAI, MiniMax, Kling, HeyGen, Suno, ElevenLabs Music/SFX, and
  Runway image-to-video need sanitized request/response fixtures before they can
  be called "production-perfect."
- Keep secrets out of fixtures. Redact `Authorization`, `x-key`, `xi-api-key`,
  API-key query parameters, temporary result URLs when needed, and any provider
  account identifiers.
