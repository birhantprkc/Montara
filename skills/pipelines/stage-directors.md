# Pipeline stage directors

Each pipeline is a **shape** — an ordered set of beats with relative weights and a palette. The
planner distributes the target runtime across the beats and titles each scene (the opening beat
carries the idea). These shapes are deterministic and need no model; a brain later rewrites the
titles/narration while keeping the shape. Drive a pipeline with:

```
montara pipelines                              # list all
montara make --pipeline <id> "<idea>"          # shape → Timeline IR → MP4
montara plan --pipeline <id> --seconds 30 "<idea>"
```

| id | shape (beats) |
|---|---|
| `animated-explainer` | Hook → Why it matters → How it works → In practice → Takeaway |
| `animation` | Title in → Idea → Detail → Payoff |
| `avatar-spokesperson` | Intro → Message → Proof → Call to action |
| `cinematic` | Cold open → The build → The reveal → Resolve |
| `clip-factory` | Hook -> payoff -> next action |
| `documentary-montage` | Cold open → Context → Evidence → What it means → Close |
| `hybrid` | Open → Footage → Support visual → Close |
| `localization-dub` | Source segment → Translated caption → Dub note |
| `podcast-repurpose` | Hook quote → Context → The punch → Full episode |
| `screen-demo` | Intro → Step 1 → Step 2 → Step 3 → Recap |
| `talking-head` | Intro → Point one → Point two → Outro |
| `kinetic-typography` | Line one → Line two → Line three → Land it |

Rules of the shape (kept even when a model rewrites the words):
- **The first beat earns attention** — it moves from frame one; it is never dead air.
- **Weights set pacing** — heavier beats (how-it-works, evidence, payoff) get more screen time.
- **Every scene is a Timeline IR clip** — the shape compiles to the same IR every renderer consumes.
- **Degrade, never break** — with no brain and no footage, the shape still renders a clean,
  titled, paced video so a run always yields something watchable.
