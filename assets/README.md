# Montara Assets

These assets are generated locally for Montara and can be regenerated with:

```powershell
node .\node_modules\esbuild\bin\esbuild scripts\render-demo-assets.ts --bundle --platform=node --format=esm --outfile=scripts\.render-demo-assets.mjs
node scripts\.render-demo-assets.mjs
```

See `docs/DEMOS.md` for the prompt, pipeline, tools, runtime, cost, and artifact
ledger for the public demo gallery.

## Current Outputs

- `logo.png` - Montara logo card.
- `social_preview.png` - social preview card.
- `showcase.jpg` - poster frame from the showcase clip.
- `montara-showcase.mp4` - compact capability reel.
- `montara-threejs-proof.mp4` - Three.js engine-slot proof, rendered through fallback.
- `montara-manim-proof.mp4` - Manim engine-slot proof, rendered through fallback.
- `montara-blender-proof.mp4` - Blender proof clip; native Blender if installed, fallback otherwise.
- `montara-assets.json` - manifest with renderer status and durations.
