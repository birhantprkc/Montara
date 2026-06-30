# Native Render Validation

Montara can route the same Timeline IR through FFmpeg, Remotion, Revideo,
Motion Canvas, Three.js, Manim, Blender, Spline, HyperFrames, and Playwright.
This skill tells agents how to prove what actually rendered before claiming a
native engine is working.

## When To Use

Read this before:

- claiming a runtime is native rather than a registered adapter;
- adding a render engine, scene type, or validation case;
- switching away from FFmpeg fallback;
- presenting a demo as Remotion, Three.js, Blender, Manim, Motion Canvas,
  Revideo, Spline, HyperFrames, or Playwright output.

## Prime Rule

Native means the named runtime executed and produced the artifact. A successful
FFmpeg fallback is good, but it is not native proof. Say "FFmpeg fallback" when
that is what happened.

## Minimum Proof For Any Engine

1. Run the engine availability probe:
   `montara engines` or the package probe used by the adapter.
2. Render a tiny deterministic scene to a real MP4 under `out/`.
3. Probe the MP4 with ffprobe or Montara QA:
   `montara review <out.mp4>` or `qaPlayback`.
4. Confirm all of:
   - file exists and is non-empty;
   - video stream exists;
   - expected width, height, fps, and duration are close to target;
   - at least two sampled frames differ for motion-oriented scenes;
   - audio stream exists when the contract promised audio.
5. Record the runtime used in docs or render report. If the runtime fell back,
   record the fallback reason.

## Engine-Specific Proofs

| Engine | Native proof | Common blocker |
| --- | --- | --- |
| FFmpeg | `renderTimeline` or `montara render` produces MP4; ffprobe passes. | Missing FFmpeg binary. |
| Remotion | `npm.cmd run validate` native Remotion smoke creates `out/validate-remotion-native.mp4` when composer deps are installed. | Composer package missing; Chromium timeout; audio props not passed. |
| Revideo | Revideo binary/package renders a tiny Timeline-derived scene, not just registry presence. | Adapter registered but no native runner. |
| Motion Canvas | Motion Canvas CLI/package renders a kinetic scene; sampled frames show motion. | Registered target only; no project scaffold. |
| HyperFrames | `npx hyperframes lint`, `validate`, and `render` pass for the workspace. | Node version, asset paths, contrast, or browser validation failure. |
| Three.js | Headless/browser render produces non-blank canvas frames; sampled pixels differ over time. | WebGL/Chromium unavailable or blank canvas. |
| Manim | Manim binary renders a scene file to MP4; ffprobe passes. | Python env or LaTeX dependency missing. |
| Blender | Blender executable runs headless scene script and writes MP4. | Blender not installed or GPU/headless driver issue. |
| Spline | Export/capture adapter produces MP4 from a real Spline scene. | Planned only until adapter exists. |
| Playwright | Browser/capture path records a page flow to MP4/WebM then transcodes to MP4. | Browser not installed, auth state missing, or private data unreviewed. |

## Commands

```bash
montara engines
montara recommend title-3d
montara recommend title-3d out/native-three-smoke.mp4
montara render3d three out/native-three.mp4
montara render3d blender out/native-blender.mp4
npm.cmd run validate
npm.cmd run verify
```

Use package-specific commands when the adapter exposes them, but always finish
with `verify` for contract coverage and `validate` when a user-facing flow or
real MP4 changed.

## Native Versus Fallback Language

Use these labels in reports:

- `native`: named runtime executed and passed MP4 QA.
- `runtime-gated`: adapter exists, runtime not installed here.
- `fallback`: FFmpeg or another lower runtime produced the artifact.
- `planned`: registry/docs entry only; do not route production work here.

Do not say "Remotion render" when the Remotion adapter returned FFmpeg output.
Do not say "Three.js works" when only the engine registry contains `three`.
Do not say "Playwright renderer" for a browser recording; Playwright is a
capture engine, not a Timeline composition renderer.

## Visual QA

For browser/canvas runtimes such as Three.js, HyperFrames, Playwright, Motion
Canvas, and Revideo:

1. Capture at least three frames: start, middle, end.
2. Reject fully black, fully transparent, or identical-frame outputs unless the
   brief explicitly requested a static hold.
3. Check framing at desktop and mobile profile sizes when the output is
   responsive.
4. Verify text does not overlap, crop, or fall below contrast requirements.

For Blender and Manim:

1. Verify the generated scene file or script exists in the project workspace.
2. Verify the MP4 duration matches the scene timing.
3. Check that camera/framing includes the subject and that labels are readable.

## Audio QA

Native visual proof is not enough for finished videos. If narration, music, or
SFX are part of the output, run:

- ffprobe stream check;
- `hear` or `qaPlayback` loudness/duration check;
- transcript spot-check when narration exists.

Missing audio is a blocking failure unless the brief explicitly asked for
silent output.

## Escalation Rules

If native render fails:

1. Preserve the error output.
2. State the missing dependency or runtime blocker.
3. Offer setup if the user wants native output.
4. Use FFmpeg fallback only when the delivery promise still holds.
5. Log the fallback in the Timeline metadata, render report, or final note.

If the delivery promise depends on the native runtime, stop and ask for approval
before downgrading.

## Done Means

- The artifact exists and passes MP4 QA.
- The runtime label is truthful.
- The fallback path, if used, is visible.
- `pnpm verify` is green.
- `pnpm validate` is green when render behavior changed.
