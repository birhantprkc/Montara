# Render Engines & Auto-Pick

Montara renders the same Timeline IR through whichever engine is best for a scene **and actually
installed**. An LLM, an editor, or the orchestrator never hard-codes a renderer — it asks the picker.

## Ask before you render

```ts
import { recommendEngine, autoRenderScene, availableEngines } from "@montara/render-engines";

recommendEngine("title-3d");
// → { preferred: "three", engine: "three", native: true, available: true, reason: "..." }

recommendEngine("math");
// → { preferred: "manim", engine: "ffmpeg", native: false, available: false, reason: "Manim not installed → ffmpeg" }
```

`recommendEngine(sceneType)` returns the engine that **will actually run**: the preferred engine if
it's installed, otherwise the ffmpeg compositor (which always works). `availableEngines()` lists the
real install state of all engines — use it to populate a GUI dropdown or a doctor report.

## Scene type → preferred engine

| sceneType | preferred | native today |
| --- | --- | --- |
| `assembly`, `caption-card` | ffmpeg | ✓ always |
| `explainer`, `stat-reveal`, `captions` | remotion | ✓ when `remotion-composer/` present |
| `3d`, `title-3d` | three.js | ✓ (Chrome/Edge + `three`) |
| `3d-pro` | blender | ✓ when Blender installed |
| `math`, `diagram` | manim | degrades to ffmpeg until installed |
| `kinetic-typography`, `motion-graphics` | motion-canvas | degrades to ffmpeg until installed |

## Just give me a clip

```ts
const r = autoRenderScene({ sceneType: "title-3d", title: "MONTARA", outPath: "intro.mp4", seconds: 2 });
// picks three.js (WebGL) if available, Blender for 3d-pro, else the ffmpeg compositor — always returns a real MP4
```

CLI:

```
montara engines                      # install state of every engine
montara recommend title-3d           # which renderer would run, and why
montara recommend title-3d out.mp4   # ...and actually render it via the picked engine
montara render3d three out.mp4       # force the native three.js WebGL renderer
```

## Why some adapters "degrade"

`revideo`, `motion-canvas`, and `manim` ship as honest adapters: the picker routes to them when
their toolchain is installed, and to the ffmpeg compositor when it isn't — so a render never fails
for a missing engine. `three.js`, `blender`, and `remotion` have real native adapters today.
