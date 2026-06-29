# Montara Editing — Layers, Transforms, Masks, Effects, PiP, Collage

This folder is the LLM's reference for **professional, layered video editing** on the Montara
Timeline IR. Everything an editor app does — picture-in-picture, collage grids, shape masks,
colour/blur effects, opacity, stacking order — is expressed as plain data on the one IR and
compiled to a real MP4 by the ffmpeg compositor (`compositeTimeline`). No effect is a special
"mode": they are all just fields on a clip.

## The mental model

A `Timeline` is a `composition` (width/height/fps/duration/background) plus ordered `tracks`,
each holding `clips`. The compositor paints the background, then **overlays every video-track clip
in z-order**, then burns text, then mixes audio. A clip becomes a *layer*; its `transform`,
`box`, `crop`, `mask`, and `effects` decide how that layer looks and where it sits.

| Want | Reach for | Doc |
| --- | --- | --- |
| Stack two videos / webcam corner | `transform` + tracks | [transforms-and-pip.md](transforms-and-pip.md) |
| Grid of clips | `box` per tile | [collage.md](collage.md) |
| Circle / rounded crop | `mask` | [masks.md](masks.md) |
| Blur, B&W, colour, chromakey | `effects[]` | [effects.md](effects.md) |
| Multiple stacked layers | tracks + `z` | [layers-and-tracks.md](layers-and-tracks.md) |
| Pick the best renderer | auto engine picker | [render-engines.md](render-engines.md) |
| Hand off to Premiere/DaVinci/FCP | EDL/FCPXML/OTIO export | [editor-bridges.md](editor-bridges.md) |

## Builders (so you rarely hand-write IR)

```ts
import { pictureInPicture, collage, mediaClip, setMask, addEffect, setTransform } from "@montara/core";
import { compositeTimeline } from "@montara/render-ffmpeg";

const tl = pictureInPicture({ width, height, fps, durationSec, base, inset, corner: "br", insetScale: 0.3, insetMask: { shape: "ellipse" } });
compositeTimeline(tl, "out.mp4");
```

## CLI (for agents / editors that shell out)

```
montara fx pip   <base> <inset> [out.mp4] [--corner br|tl|tr|bl] [--scale 0.3] [--ellipse] [--seconds N]
montara fx collage <out.mp4> <clip1> <clip2> [clip3 ...] [--cols N] [--seconds N]
montara fx composite <timeline.json> [out.mp4]
```

## Rules

1. **Everything is a layer.** Don't invent render modes — set fields on a clip.
2. **Coordinates are composition pixels.** `transform.x/y` is the clip's *center*. `scale` is box
   width as a fraction of composition width; height follows source aspect unless `box` forces it.
3. **Masks live in the clip's own box**, normalized 0..1, with `feather` for soft edges.
4. **Effects are an ordered chain** — applied before compositing, in array order.
5. **Stacking** = track order then clip order, overridable per clip with `z` (higher = on top).
6. **Always re-validate** (`validateTimeline`) after edits; ops in `@montara/core/edit` keep the IR valid for you.
