# Cutting

Trimming a clip is not editing. Editing is what happens to *everything else* when you trim it.
These operations are pure functions over the Timeline IR in `@montara/core`, and each one is
opinionated about what moves and what holds still.

```bash
montara cut out/timeline.json <operation> [args] [--out other.json]
montara cut out/timeline.json gaps v1     # inspect before you commit
```

Every operation validates the result before writing. An edit that produces an invalid timeline is
refused, and the file on disk is left alone.

## The operations

| Operation | What moves | Use it when |
|---|---|---|
| `split` | nothing | You want two clips where there was one |
| `ripple` | everything after | A bad take must vanish and leave no hole |
| `trim` | everything after | The out point is wrong and the cut should stay tight |
| `roll` | only the edit point | The cut lands late — one shot should give a beat to its neighbour |
| `slip` | nothing | Right framing, wrong moment inside the shot |
| `slide` | the neighbours | Right shot, wrong place in the sequence |
| `crossfade` | the incoming clip | A hard cut is too abrupt for the transition |

```ts
import { rippleDelete, rollEdit, slipClip, slideClip, splitClip } from "@montara/core";

tl = splitClip(tl, "interview", 12.4);   // cut in two at 12.4s
tl = rippleDelete(tl, "interview-b");    // delete and close up behind it
tl = rollEdit(tl, "wide", "close", 0.5); // give the wide half a second more
tl = slipClip(tl, "broll", -1.2);        // same slot, earlier footage
tl = slideClip(tl, "insert", 0.4);       // nudge it later, neighbours absorb it
```

`split` is the one people get wrong. Splitting a *video* clip has to advance the second half's
`sourceInSec`, otherwise both halves replay the same footage — the classic stutter. `splitClip`
does this for you.

## J-cuts and L-cuts

The single highest-leverage edit in factual video: never let picture and sound change at the same
instant. Bring the audio in early and the cut feels motivated; hold it over and the cut feels
finished.

```ts
tl = jCut(tl, "narration-3", 0.8);  // audio leads the picture by 0.8s
tl = lCut(tl, "narration-2", 0.6);  // audio holds 0.6s over the next shot
```

```bash
montara cut out/timeline.json jcut narration-3 0.8
```

0.5–1.0s is the working range. Under 0.3s nobody notices; over 1.5s it reads as a mistake.
Both operations clamp at the head of the timeline rather than pulling audio negative.

## Gaps

A plain `removeClip` leaves a hole. That is sometimes what you want — a held black, a breath — and
usually not.

```bash
montara cut out/timeline.json gaps v1    # list them
montara cut out/timeline.json close v1   # pull everything together
```

Check for gaps before every render. A one-frame gap is invisible in the IR and very visible on
screen.

## Rules

- Operations are immutable: they return a new timeline and never mutate the input.
- Roll, slip, and slide clamp rather than invert. You cannot roll a neighbour to zero length or
  slip past the head of the source.
- Cut against the transcript, not the clock, when the cut has to land on a sentence. See
  `montara understand` and the Shorts boundary gate.
- Duration is a contract: `roll` and `slide` preserve the total, `ripple` and `trim` deliberately
  shorten it. If a `roll` changed your runtime, something else is wrong.
