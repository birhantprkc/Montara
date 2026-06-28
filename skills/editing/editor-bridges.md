# Pro-Editor Bridges (EDL / FCPXML / OTIO)

Edit in Montara, finish in a pro NLE. The Timeline IR is the source of truth; these exporters give
the big editors a faithful view of the cut so an editor can take over.

| Format | Opens in | Use |
| --- | --- | --- |
| **EDL** (CMX3600) | DaVinci Resolve, Premiere, Avid, every color tool | universal cut list / conform |
| **FCPXML** 1.10 | Final Cut Pro (and Premiere via import) | rough cut with media references |
| **OTIO** (.otio) | DaVinci Resolve, Premiere (OpenTimelineIO) | modern interchange, multi-track |

```ts
import { exportTimeline, timelineToEDL, timelineToOTIO, timelineToFCPXML } from "@montara/bridge";
const { content, ext } = exportTimeline(timeline, "otio", { title: "My Cut" });
```

CLI:

```
montara export edl    timeline.json out.edl
montara export fcpxml timeline.json out.fcpxml
montara export otio   timeline.json out.otio
```

## What survives the handoff

- **Cut & timing** — every video clip's record position and source in/out (frame-accurate, non-drop).
- **Media references** — media clips export their file path (EDL clip name, FCPXML `<asset>` src,
  OTIO `ExternalReference`). Generated/solid clips export as black (EDL `BL` reel) / gaps.
- **Tracks** — OTIO keeps video and audio tracks separate.

## What does NOT round-trip (re-render in Montara for these)

Per-clip **effects, masks, transforms (PiP/collage), and text styling** are Montara-side and are not
encoded into the interchange — the NLE sees a flat cut. Keep the IR as the master; treat the export
as a conform/finishing handoff, and bring final-grade effects back to Montara if you need them baked.
