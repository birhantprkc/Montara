# Subject Matting And Layered Effects

Use this when the edit needs text behind a person, foreground/background separation, name-from-
background effects, tracked callouts, or clean compositing around hair and motion.

No green screen is required. Montara runs the matting models locally, and only the ones this
machine can actually run.

## Check what the machine can run, first

```bash
montara models hardware   # cores, RAM, accelerator, free disk
montara models plan       # the variant chosen per family, or why none was
```

`plan` is the gate. Each family reports either a chosen variant with `downloadApproved: true`, or a
refusal with the reason. **A refusal is final** — nothing downloads weights the machine cannot run,
because a model that OOMs mid-render is worse than one we declined. Passing `--cpu` evaluates the
CPU path even on a GPU box, which is how you see what a viewer's laptop would get.

Two probes, two different questions. `montara models hardware` asks the machine (nvidia-smi);
the gate additionally asks the *interpreter* whether torch can drive that device. A CPU-only
torch wheel on a CUDA laptop means the GPU is real but unusable, so the gate steps down to a
CPU-viable variant and says why. A small model that runs beats a large one that stalls.

## The whole effect in one command

```bash
montara replace-bg walk.mp4 sea-view.jpg out/shot.mp4 \
  --text "SAN FRANCISCO" --rise \
  --subject-scale 1.3 --subject-y 660
```

This mattes the subject, builds the Timeline IR, and renders it. The IR is written next to the
MP4 — **that file is the handoff**. The next note ("title lower", "hold it longer", "add a cut")
is an edit to the IR followed by `montara render`, not another run of the model.

Matting is the only slow step, so never repeat it while iterating on the look:

```bash
montara replace-bg walk.mp4 sea-view.jpg out/v2.mp4 --matte out/matte.mp4 --text-y 520
```

## Make the matte on its own

```bash
montara matte speaker.mp4 out/vision/matte.mp4 \
  --apply-to out/timeline.json --clip speaker
```

`matte` walks a quality ladder and tells you which rung it landed on:

1. **RVM** — Robust Video Matting. Purpose-built for people, temporally stable, no prompt needed.
2. **YOLO → SAM 2** — detect the subject, seed SAM 2 with that box, track the mask. Works on any
   subject, costs more.
3. **chromakey** — only with `--chromakey`, and only meaningful if there really is a screen.
4. **none** — every path is closed. The clip renders opaque and the reason is printed. Do not
   fake the effect.

For a non-person subject, or when you want to choose the thing being cut out:

```bash
montara detect  clip.mp4 --classes person,car     # what is in frame, and where
montara segment clip.mp4 out/mask.mp4 --auto      # detect + segment in one step
montara segment clip.mp4 out/mask.mp4 --box 120,80,900,700
montara segment clip.mp4 out/mask.mp4 --point "640,360;700,400"
```

## Degrade honestly

If production matting is unavailable, do not fake a text-behind-subject effect. Use safe-zone
overlays, picture-in-picture, or manual masks. The rendered result must stay readable and should
not pretend segmentation happened. Every command above says `unavailable` with a reason rather
than inventing a mask.

## Timeline IR contract

Represent effects as Timeline IR, not ad hoc filter strings:

- `matte`: external per-frame alpha (`path`, `featherPx`, `chokePx`, `invert`, `opacity`).
- `mask`: rect, ellipse, rounded-rect, polygon, feather, invert.
- `effects`: blur, brightness, contrast, saturation, chromakey, sharpen.
- `z`: foreground/background order.
- `transform` and `keyframes`: tracked or animated placement.

The text-behind-subject build is three layers in one composite:

| layer | `z` | what it is |
|---|---|---|
| backdrop | 0 | the new background, full frame |
| title | 10 | a text clip on a text track |
| subject | 20 | the original plate carrying the `matte` |

`z` is global across tracks, so the title's *track* does not decide its depth — its `z` does.
Text clips must live on a `text` track (the IR validator enforces it) while still sitting
between two video layers visually.

### Animating the reveal

`keyframes` on a clip compile to ffmpeg expressions over `t`, so a title can rise into place
from behind the subject:

```json
{
  "id": "title", "type": "text", "z": 10, "text": "SAN FRANCISCO",
  "transform": { "x": 960, "y": 450 },
  "keyframes": {
    "y": [
      { "atSec": 0.5, "value": 770, "easing": "ease-out" },
      { "atSec": 2.7, "value": 450, "easing": "ease-out" }
    ]
  }
}
```

The value holds before the first key and after the last, which is what an editor expects from
an animation that starts mid-clip. Ease-out lands; linear reads as a slide.

**The ffmpeg engine animates `x`, `y`, and (for text) `opacity`.** `scale` and `rotateDeg`
keyframes are carried in the IR but rendered static, because the underlying filters take no
time expression. Check `hasAnimation(clip)` before promising motion.

## Edges are the whole job

- `chokePx: 1` removes the bright halo you get when the original background was lighter than the
  new one. Reach for it before you reach for feather.
- `featherPx: 1-2` is usually right. More than that reads as a blur, not a cutout.
- Check a frame where the subject *moves* — a matte that looks perfect on a still often crawls.
- Match the light. A cutout lit from the left over a background lit from the right never sits.

## Licences

RVM is GPL-3.0, SAM 2 is Apache-2.0, and Ultralytics YOLO is **AGPL-3.0 — commercial use requires a
licence from Ultralytics**. Weights are fetched at runtime under their own model cards and are
never committed. See `docs/ATTRIBUTION.md`.
