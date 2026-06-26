# Skill: documentary craft

A skill is *how to use the pipelines well*, layered on top of the raw tools. This one covers the
data-driven documentary look that `documentary-montage` and `cinematic` are built for.

## Pick the shape, then earn attention

- Choose a pipeline whose beats match the story: `documentary-montage` (cold open → context →
  evidence → what it means → close) for explainer/analysis; `cinematic` for a trailer build; the
  9:16 shapes (`clip-factory`, `kinetic-typography`) for shorts.
- **The first beat earns attention.** It moves from frame one and states the thesis — never dead air.

## Pace and weight

- Heavier beats (how-it-works, evidence, payoff) get more screen time; the planner already
  distributes runtime by each beat's weight, so set `--seconds` to the real target and trust the shape.
- Keep average scene length tight — long static holds read as a slideshow. Check the slideshow-risk
  score in the self-review and break up any "high" runs with more cuts or motion.

## Make every claim checkable

- Run `montara research "<topic>"` first and lean on the returned angles; prefer claims a viewer
  could verify. Retrieve supporting footage semantically rather than by keyword guessing.

## Always self-review

- After `make`, read the `*.self-review.json`. Treat *fail* checks as blockers; treat *warn*
  (silent audio, mild slideshow risk) as a to-do for the next pass, not a release stopper.
