# Provider Audit

Montara can build request specs for cloud video, image, TTS, music, and SFX
providers while staying local-first. This skill tells agents how to audit those
request specs before any live BYOK call spends money or sends user content.

## When To Use

Read this before:

- changing `packages/providers/src/registry.ts`;
- changing Python provider tools under `tools/`;
- adding a new provider or model default;
- running `montara providers smoke <provider-id> --live`;
- running `montara providers live-audit --live`;
- claiming a cloud provider is production-ready.

## Safety Contract

No provider call is live unless all of these are true:

1. The user or operator supplied the relevant API key in the environment.
2. `MONTARA_LIVE_PROVIDER_SMOKE=1` is set.
3. The command uses `--live`.
4. The request has been redacted in logs and fixtures.
5. The provider's current official docs were checked for endpoint, auth,
   required fields, response shape, and polling/download flow.

Without all five, stay in dry-run fixture mode.

## Commands

```bash
montara providers audit --out out/provider-audit-fixtures.json
montara providers live-audit --out out/provider-live-audit.json
montara providers smoke flux --category image --json
montara providers smoke flux --category image --live --out out/flux-smoke.png
npm.cmd run verify
npm.cmd run validate
```

`providers audit` writes a redacted fixture report for every cloud provider in
the TypeScript registry. `providers live-audit` writes a sanitized readiness
ledger across cloud providers: dry-run, missing-key, opt-in-required, passed, or
failed. `providers smoke` builds one provider request. It is a dry-run by
default; `--live` executes only when the opt-in env var and key are present.

## Official Docs Checklist

For each provider, check the current official docs immediately before changing
request shape or running a live smoke.

| Provider family | Check |
| --- | --- |
| OpenAI Images / TTS | Model id, endpoint, response encoding, audio/image format fields. |
| Black Forest Labs | FLUX endpoint name, `x-key` auth, async `polling_url`, result asset field. |
| Google Gemini / Veo | Interactions API or model path, header-based `x-goog-api-key`, image `response_format`, `instances`/`parameters`, operation polling. |
| Runway | API version header, current `image_to_video` task endpoint, `promptText`, optional `promptImage`, duration/ratio constraints. |
| ElevenLabs TTS/Music/SFX | `xi-api-key` auth, voice/music endpoint, duration and output fields. |
| Recraft / xAI / Kling / MiniMax / HeyGen / Suno | endpoint, auth style, task creation body, polling/status response, output asset URL. |

If docs are unavailable or ambiguous, mark the provider `fixture-gated` and do
not call it live.

## Fixture Requirements

A valid fixture proves:

- request method is `GET` or `POST`;
- URL is HTTP(S) and points at the provider endpoint;
- JSON body parses when present;
- auth headers/query params are redacted;
- async providers record polling fields;
- no API key, account id, temporary signed URL, or user private prompt is saved.

Fixtures may include harmless sample prompts, but never real customer source
material.

## Live Smoke Protocol

1. Run dry-run first:
   `montara providers smoke <id> --category <kind> --json`.
2. Run `montara providers live-audit --out out/provider-live-audit.json` to see
   which providers have keys and which would need explicit opt-in.
3. Compare the redacted request against official docs.
4. Set only the one required provider key.
5. Set `MONTARA_LIVE_PROVIDER_SMOKE=1`.
6. Run `--live` with a tiny, low-cost prompt and short duration.
7. Save only the redacted request/response shape and a tiny disposable artifact.
8. Re-run `verify` and `validate`.
9. Update `docs/PROVIDER-AUDIT.md` with date, provider, model, and result.

If the provider charges per job, use the cheapest documented quality/duration
that still exercises the response path.

## Redaction Rules

Always redact:

- `Authorization`;
- `x-key`;
- `xi-api-key`;
- query parameters named `key`, `api_key`, `client_id`, or similar;
- polling URLs containing job ids when the id could identify an account;
- signed CDN URLs;
- provider account, workspace, or organization ids.

The fixture may keep stable public endpoint paths and non-sensitive model ids.

## Production-Ready Claim

Do not call a provider production-ready until all are true:

- dry-run fixture exists and is verified;
- live-key smoke passed recently;
- response parsing wrote the expected artifact;
- cost path is documented;
- fallback remains local/free when no key is present;
- docs name the remaining caveats, if any.

Until then, use `fixture-gated`, `runtime-gated`, or `BYOK-live-unconfirmed`.

## Failure Handling

When a smoke fails:

1. Preserve the redacted request and status/error body.
2. Check whether the docs changed, the key lacks permission, or the model is
   region/account-gated.
3. Do not retry blindly; paid providers can bill failed jobs.
4. Keep the fallback path available and honest.
5. Record the blocker in `docs/PROVIDER-AUDIT.md`.

## Done Means

- `montara providers audit` reports zero invalid fixtures.
- `montara providers live-audit` records provider readiness without secrets.
- Any live smoke used explicit opt-in and redacted output.
- `pnpm verify` passes.
- `pnpm validate` passes when provider execution or CLI behavior changed.
- Docs state fixture/live status without overclaiming.
