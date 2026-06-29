# Provider Audit Notes

Cloud media APIs change frequently. Montara's TypeScript provider registry is
network-free by design: it builds request specs and falls back locally when no
credential is present. That makes tests deterministic, but it does not replace a
live BYOK executor audit before spending user money.

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
  defaults request specs to `gpt-image-1`.
- OpenAI TTS now defaults request specs to `gpt-4o-mini-tts`.
- Google Imagen endpoint moved from Imagen 3 to the Imagen 4 family and uses
  `instances` / `parameters` shape in the request spec.
- Google Veo endpoint was moved to the preview-style Veo 3 long-running model
  path and is marked as requiring a live executor audit.

## Known Follow-Ups

- Runway image-to-video generally requires a prompt image and versioned headers.
  Montara's current registry entry should not be used as a text-to-video live
  executor without a provider-specific adapter update.
- BFL, Recraft, xAI, MiniMax, Kling, HeyGen, Suno, and ElevenLabs Music/SFX need
  live request/response executor tests with real keys before they can be called
  "production-perfect."
- Provider tests should eventually record sanitized HTTP fixtures for each live
  executor while keeping secrets out of the repo.
