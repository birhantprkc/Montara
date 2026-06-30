# Montara Skill Roadmap

Montara has two skill layers:

- `skills/`: Montara-specific Layer 2 operating guidance.
- `.agents/skills/`: provider/runtime Layer 3 knowledge packs, many aligned with
  public skills available from https://www.skills.sh/.

The goal is not to copy every skill blindly. The goal is to expose the right
skills through Montara's tool registry and selector pattern so agents reliably
load them before doing work.

## Already Present And High Value

| Family | Local Layer 3 skills | Montara use |
| --- | --- | --- |
| GSAP | `gsap-*` | Kinetic typography, SVG motion, HyperFrames, advanced Remotion animation. |
| HyperFrames | `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `website-to-hyperframes` | HTML/GSAP composition, website-to-video, registry blocks. |
| Three.js | `threejs-*` | 3D titles, system maps, shader/postprocessing scenes. |
| Manim | `manim-composer`, `manimce-best-practices`, `manimgl-best-practices` | Math, science, diagrams, explainers. |
| FFmpeg/video | `ffmpeg`, `video-edit`, `video-understand`, `video-download` | Local media work, understanding, edit operations. |
| Audio/speech | `speech-to-text`, `elevenlabs`, `music`, `sound-effects`, `acestep` | Transcription, TTS, scoring, SFX, stems. |
| Visual systems | `visual-style`, `d3-viz`, `tailwind-design-system` | Brand/style extraction, data visuals, UI polish. |
| Screen capture | `playwright-recording`, `synthetic-screen-recording` | Browser walkthroughs, terminal demos, auth-state recording. |
| Character animation | `character-rigging`, `svg-character-animation`, `pose-library-design`, `character-animation-qa` | Reusable 2D character workflows. |

## Montara Layer 2 Skills To Strengthen

1. `skills/core/playwright-recording.md`: Montara-specific login, privacy,
   storageState, MP4 transcode, and Timeline IR ingestion.
2. `skills/core/desktop-screen-capture.md`: FFmpeg/Cap routing for software
   trailers and native desktop app demos.
3. `skills/core/native-render-validation.md`: added; how agents validate
   Remotion, Revideo, Three.js, Manim, Blender, Motion Canvas, Spline, and
   Playwright.
4. `skills/core/provider-audit.md`: added; how to check official docs before
   live BYOK calls.
5. `skills/creative/topic-aware-overlays.md`: how reel/talking-head edits choose
   diagrams, UI mockups, system maps, data visuals, or minimal overlays.
6. `skills/meta/documentary-evidence-craft.md`: generalized premium documentary
   method. Added and should replace brand-specific references.

## Tool Registry Expectations

Every tool that benefits from Layer 3 knowledge should declare `agent_skills`.
Examples:

- `playwright_recorder` -> `playwright-recording`
- HyperFrames compose tools -> `hyperframes`, `hyperframes-cli`, `gsap-core`,
  `gsap-timeline`
- Three.js tools -> the relevant `threejs-*` skill(s)
- Manim tools -> `manim-composer`, `manimce-best-practices`
- music analyzer/scoring tools -> `music`, `acestep`, `speech-to-text`

## Gaps Worth Building

- Topic-aware overlay skill for reel/talking-head visual reasoning.
- Spline capture/export adapter and validation skill.
- Real local vision model skill path for CLIP/BLIP/video-language analysis.
- Speaker/voice intelligence skill path for pyannote, SpeechBrain, Resemblyzer,
  voice embeddings, and corpus matching.
- Production matting/compositing skill path for hair/edge/motion-aware masking.
- Music intelligence Layer 2 skill that turns spectral/tempo/onset analysis into
  scene-mapped score decisions.
