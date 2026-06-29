# Desktop Screen Capture

Montara-specific guidance for recording native desktop applications, IDEs,
terminals, design tools, games, and local software demos.

## Tools

- `screen_capture_selector`: choose the capture route.
- `screen_recorder`: FFmpeg desktop capture.
- `cap_recorder`: pick up polished Cap recordings.
- `playwright_recorder`: browser-only; use only when the subject is a website.

## Decision Matrix

| Brief | Prefer | Why |
| --- | --- | --- |
| Native desktop app trailer | `screen_recorder` | Free, local, automatable capture. |
| Polished cursor/webcam product demo | `cap_recorder` | User-driven but better presentation effects. |
| Website or SaaS trailer | `playwright_recorder` | Repeatable browser capture and auth-state support. |
| Terminal-only demo | synthetic terminal or FFmpeg | Often clearer than raw desktop video. |

## Desktop App Trailer Flow

1. Ask what workflows matter, or infer them from the prompt.
2. Record a short source pass.
3. Review the capture before editing.
4. Build a Timeline IR with trims, zooms, callouts, captions, and music.
5. QA the MP4 for readability at target resolution.

Montara currently records desktop apps but does not ship a free general-purpose
OS automation layer that can operate arbitrary apps. If the user asks for app
driving, be honest: record is available; autonomous desktop control is planned.
