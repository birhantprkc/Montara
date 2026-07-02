# Provider Audit Notes

Cloud media APIs change frequently. Montara's TypeScript provider registry is
network-free by design: it builds request specs and falls back locally when no
credential is present. That makes tests deterministic, but it does not replace a
live BYOK executor audit before spending user money.

Last checked: 2026-07-01.

## Checked References

- OpenAI image generation: https://platform.openai.com/docs/guides/image-generation
- OpenAI audio speech: https://platform.openai.com/docs/api-reference/audio/createSpeech
- Google Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- Google Gemini video generation / Veo: https://ai.google.dev/gemini-api/docs/video
- Runway API guide: https://docs.dev.runwayml.com/guides/using-the-api/
- Black Forest Labs API docs: https://docs.bfl.ai/
- ElevenLabs text-to-speech: https://www.elevenlabs.io/docs/api-reference/text-to-speech/convert
- Skills discovery reference: https://www.skills.sh/

## Changes Applied

- OpenAI Images keeps the legacy provider id `dalle3` for compatibility but now
  defaults TypeScript request specs to `gpt-image-2`.
- OpenAI TTS now defaults request specs to `gpt-4o-mini-tts`.
- Black Forest Labs FLUX moved from the older FLUX 1.1 endpoint to
  `flux-2-pro-preview`, with `x-key` auth and `polling_url` in the request spec.
- Google image generation now targets the Gemini Interactions API
  (`/v1beta/interactions`) with `x-goog-api-key` auth and an explicit
  `response_format` image request.
- Google Veo moved to the Veo 3.1 long-running model path with typed
  `instances` / `parameters` and header-based `x-goog-api-key` auth.
- Runway now emits a current Gen-4.5 `image_to_video` task request with
  `X-Runway-Version`, `model: "gen4.5"`, and `promptText`; Montara omits
  `promptImage` for text-only generations per the official API pattern.
- `packages/providers/src/executor.ts` now provides an injectable BYOK executor
  plus request redaction, so CI can replay sanitized HTTP fixtures without live
  keys, network calls, or provider spend.
- `packages/providers/src/audit.ts` builds a redacted fixture report for all 18
  cloud providers and exposes a dry-run/live smoke harness. CLI entry points:
  `montara providers audit`, `montara providers live-audit`, and
  `montara providers smoke <provider-id> [--live]`.
- `montara providers live-audit --out out/provider-live-audit.json` writes a
  sanitized readiness ledger across cloud providers. It records `dry-run`,
  `missing-key`, `opt-in-required`, `passed`, or `failed` without raw requests,
  API keys, signed output URLs, or provider response bodies.

## Known Follow-Ups

- The TS executor and audit harness are fixture-tested, not broadly live-key
  tested. Before spending user money, run `montara providers smoke <id> --live`
  with `MONTARA_LIVE_PROVIDER_SMOKE=1`, then save a sanitized fixture and update
  the live-audit ledger.
- Python image providers now expose testable request builders:
  `tools/graphics/openai_image.py` defaults to GPT Image 2, and
  `tools/graphics/flux_image.py` prefers direct BFL FLUX.2 while retaining
  fal.ai as a compatibility fallback. They still need real-key smoke runs before
  production spend.
- Recraft, xAI, MiniMax, Kling, HeyGen, Suno, ElevenLabs Music/SFX, and
  Runway image-to-video now have sanitized request fixtures where represented in
  the registry, but still need live response fixtures before they can be called
  "production-perfect."
- Keep secrets out of fixtures. Redact `Authorization`, `x-key`, `xi-api-key`,
  API-key query parameters, temporary result URLs when needed, and any provider
  account identifiers.
