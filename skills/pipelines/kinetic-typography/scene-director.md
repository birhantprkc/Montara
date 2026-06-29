# Scene Director - Kinetic Typography Pipeline

## Goal

Map the script to typography scenes with rhythm, hierarchy, and transitions.

## Process

1. Assign each line group to a scene or sub-beat.
2. Choose motion families: word cascade, scale slam, reveal wipe, marker sweep,
   elastic settle, or restrained fade/lift.
3. Define hold time after each dense phrase so the viewer can read it.
4. Choose transitions between scenes; avoid jump cuts unless the beat explicitly
   needs a hard impact.
5. Mark which scenes need audio-reactive timing from `hear` or transcript timing.

## Output Requirements

- `scene_plan` names the text, duration, hierarchy, motion family, and transition
  for every beat.
- The plan identifies safe zones for platform variants.
- The plan keeps repeated motifs reusable instead of inventing a new layout every
  scene.

## Review Focus

- Motion supports meaning, not decoration.
- Text never overlaps incoherently.
- Rhythm changes are intentional and visible in the plan.
