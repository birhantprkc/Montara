# Playwright Recording

Montara-specific Layer 2 guidance for browser trailers, product walkthroughs,
and websites behind login. For raw Playwright API knowledge, read the Layer 3
skill `.agents/skills/playwright-recording/SKILL.md` before using the tool.

## Tool

- `playwright_recorder`
- capability: `screen_capture`
- provider: `playwright`
- selector route: `screen_capture_selector` when `url` is present

## When To Use

Use Playwright when the subject is a browser page, dashboard, SaaS app, docs
site, web game, or marketing page that can run in Chromium.

Do not use it for native desktop apps. For desktop software trailers, use
`screen_recorder` or `cap_recorder`.

## Auth Flow

1. Create a gitignored project directory.
2. Run `interactive_login` with the target URL.
3. Let the user log in manually in the opened browser.
4. Save `auth_state_path` under `projects/<name>/auth/`.
5. Reuse that state during `record`.
6. Review the recording for private data before publishing.

Never commit `storageState` files.

## Recording Flow

1. Choose viewport and duration based on the output profile.
2. Record the browser with Playwright.
3. Transcode Playwright's raw WebM recording to MP4 through FFmpeg.
4. Ingest the MP4 as a source clip into the Timeline IR.
5. Add callouts, zooms, captions, highlights, and music only after reviewing the
   captured footage.

## QA

- MP4 exists and `ffprobe` can read it.
- Login state was not committed.
- Private user data is blurred, removed, or approved.
- Cursor/scroll/typing pace is understandable.
- Captions and callouts do not cover the UI being demonstrated.
