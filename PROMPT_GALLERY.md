# Montara Prompt Gallery

These prompts are designed for Montara's actual contract: inspect sources,
create or update a Timeline IR, render a real MP4, run QA, and export editor
formats when requested. Use them with an AI coding assistant or the `montara`
CLI.

## Zero-Key Prompts

These should work without paid API keys by using the local/free path and FFmpeg
fallbacks.

### Fast Sanity Render

> "Make a 20-second zero-key video about why Montara uses a Timeline IR. Use text, simple motion, captions, and export the IR plus MP4."

Expected treatment: no cloud calls, no generated imagery requirement, quick
Timeline IR render through the FFmpeg path.

### Data Card Explainer

> "Create a 45-second data-card explainer about why shipping lanes matter. Use three animated stat cards, one comparison frame, and a clean final takeaway."

Expected treatment: designed text/shape/card clips rather than fake generated
footage; good for proving the free local path.

### Content-Aware Talking-Head Reel

> "Make a 45-second reel explaining the design of Fable 5 using this talking-head footage. Keep the speaker visible, add only overlays that clarify game-design ideas, and export Timeline IR plus MP4."

Expected treatment: inspect the footage and transcript first; keep the speaker
as the emotional anchor; add mechanic diagrams, progression graphics, UI mockups,
world-system callouts, and short captions only where they help comprehension.

### Minimal Explainer

> "Create a minimal 60-second explainer about how Git rebase works. Use clean diagrams, restrained typography, no generic CTA, and export EDL/OTIO/FCPXML after rendering."

Expected treatment: Timeline IR with text, simple diagram clips, readable pacing,
MP4 render, and editor exports.

### Documentary Evidence Cut

> "Make a 90-second documentary-style video about why a shipping chokepoint matters. Use source-backed claims, honest maps, intentional silences, and a measured narration style."

Expected treatment: read `skills/meta/documentary-evidence-craft.md`; avoid fake
precision; build a corpus from open sources, select non-reused slot footage with
`clip_search.select_slots`, source every claim, cue music by scene, and master
once around `-14 LUFS`.

### Desktop Software Trailer

> "Create a trailer for this desktop app. Record the app locally, show the three most impressive workflows, add captions and callouts, and produce a final MP4."

Expected treatment: use `screen_capture_selector`; prefer FFmpeg for automated
desktop capture or Cap if the user wants polished cursor/webcam effects. If the
recording was made outside Montara, use `montara capture pick-latest
--recordings-dir ... --output ...` before composing the screen-demo.

### Website Behind Login

> "Create a 30-second trailer for this SaaS dashboard after I log in. Use Playwright, let me authenticate, then record the dashboard flow and make the MP4."

Expected treatment: run `playwright_recorder` `interactive_login`, save
`storageState` in the project workspace, record with that state, transcode to
MP4, and review for private data.

### Long Video To Shorts

> "Turn this 12-minute interview into 3 Shorts. Cut on transcript boundaries, keep the best claims in context, add captions, and export each Short plus the edit decisions."

Expected treatment: source review, transcript-aware cut points, vertical-safe
layout, no guessed fixed end timing.

## Style Switch Prompts

Use the same source material and ask for different styles. The Timeline IR
decisions should be visibly different.

### Cinematic

> "Turn this footage into a cinematic reel: slower cuts, dramatic title beats, restrained captions, strong sound design, and no hardcoded CTA."

### Documentary Evidence

> "Turn this footage into an evidence-led documentary short: source-backed labels, map/data visuals only when factual, silence at the major reveal, and transcript-verified cut points."

### Kinetic Typography

> "Make this a kinetic typography reel. Use motion text to clarify the argument, not just to repeat every spoken word."

### Minimal

> "Make a minimal version. Preserve the best source moments, use very few overlays, and keep the color and typography quiet."

### Smart Talking Head

> "Make this talking-head clip feel premium but not fake. Keep the speaker visible, remove dead air, add helpful topic-specific overlays, and avoid generic explainer cards."

### Product Demo

> "Make this product demo quiet and professional. Focus on the actual workflow, not hype text. Use zooms and callouts only where they help the viewer follow the UI."

## Runtime-Specific Prompts

### FFmpeg-Only

> "Use only the free FFmpeg path. Trim the source into a tight 45-second story, add readable captions and light lower-thirds, master audio, and export MP4 plus OTIO."

### Manim

> "Use Manim for the math diagrams in this explainer, then compose the rendered clips into the Timeline IR and final MP4."

### Blender

> "Use Blender for one 3D hero shot, then combine it with captions and source footage in Montara."

### Three.js

> "Use Three.js for a simple 3D system map. Validate the headless browser render before committing to it."

### HyperFrames

> "Use HyperFrames if the local runtime validates. Build a kinetic HTML/GSAP product launch reel, lint/validate the composition, then render and import the result into the Timeline IR."

### Remotion

> "Use native Remotion only if the local native Remotion validate case passes. Otherwise explain the blocker and recommend the closest verified runtime."

### Revideo / Motion Canvas

> "If Revideo or Motion Canvas is installed, use it for a kinetic typography proof. If not, produce a verified FFmpeg fallback and tell me exactly what runtime is missing."

### Blender

> "Render one Blender 3D title shot if Blender is installed, then assemble it with captions and music into the Timeline IR."

## Provider-Aware Prompts

### No Paid APIs

> "Use only local/free tools. If an image/video model is missing, use designed typography, diagrams, stock search, or source footage instead of paid generation."

### BYOK Cloud

> "Use my configured cloud providers only after presenting provider, model, expected cost, and why that provider fits this brief."

### Latest-Docs Check

> "Before using any cloud provider, check the official docs for the current endpoint/model names, then update the request builder or tell me what is stale."

### One-Key Image Path

> "Use my configured OpenAI or Google image provider for three exact support visuals, but keep all text as Timeline IR overlays so the words stay correct."

### Premium Voice Path

> "Use premium TTS only after showing me the voice provider, model, expected cost, and why it fits the tone. Keep the local fallback available."

## Pipeline-Specific Prompts

### Animated Explainer

> "Make a 60-second animated explainer about how photosynthesis works for 8th graders. Use simple diagrams, friendly narration, and a clear recap."

### Hybrid Footage

> "Use this event footage as the base, then add diagrams and captions where they clarify what is happening. Do not replace the real footage with generic cards."

### Cinematic Trailer

> "Create a 30-second cinematic teaser for a fictional sci-fi tool. Use dramatic pacing, a moving cold open, and title beats, but keep the runtime choices honest."

### Podcast Repurpose

> "Turn this podcast segment into a quote-led social clip with captions, a waveform or subtle visual bed, and a hook that preserves context."

### Character Animation

> "Create a short character-animation scene explaining a security concept. Use a reusable rig or SVG parts, then QA visibility and motion."

### Localization

> "Create an English-captioned and Hindi-captioned version of this source clip. Preserve timing and export per-locale artifacts."

## Gallery Demo Set

Use this set when testing Montara after a fresh setup:

1. Zero-key Timeline IR explainer.
2. Talking-head smart overlay reel.
3. Browser-auth Playwright capture.
4. Documentary evidence cut.
5. Editor handoff with MP4 + EDL + OTIO + FCPXML.

Each demo should record:

- prompt;
- pipeline;
- runtime;
- provider/tool choices;
- cost;
- MP4 path;
- Timeline IR path;
- QA notes;
- export paths.

## Export Prompts

### Editor Handoff

> "Make the video, then give me Timeline IR, MP4, EDL, OTIO, and FCPXML so I can continue in Premiere or DaVinci."

### Revision-Friendly

> "Make the first pass with editable Timeline IR and keep all scene decisions explicit so I can change text, timing, overlays, and render runtime later."

### Compare Runtime Choices

> "Give me two options before rendering: a reliable FFmpeg version and a native-runtime version if available. Recommend one, log the decision, then render the approved path."

## Tips

- Mention the source type: talking head, gameplay, screen recording, photos,
  podcast, documentary source, or pure prompt.
- Name the style you want: cinematic, documentary, kinetic typography, minimal,
  product demo, educational, or social reel.
- Ask for "local/free only" when you do not want paid providers.
- Ask for editor exports when you want to finish in another NLE.
- Ask for the decision log when you want to understand why Montara chose a
  runtime, provider, or visual strategy.
