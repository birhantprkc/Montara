# Find Skills

Montara ships a large skills library. Don't guess a path — **search it**, then load the match. This
keeps assistants, the CLI, and the GUIs pointed at the right knowledge instead of inventing one.

```
montara skills list [category]      # every skill (optionally filtered by core/creative/meta/pipelines/editing)
montara skills find "<query>"       # rank skills by keyword (title > path > summary)
```

```ts
import { listSkills, findSkills } from "@montara/agent";
findSkills("mask circular webcam");   // → editing/masks.md, editing/transforms-and-pip.md, ...
findSkills("loudness -14 lufs");      // → meta/craft.md, ...
```

## How it works

`listSkills()` walks `skills/**/*.md`, taking each file's first `#` heading as the title and the
first prose line as the summary, so the index never drifts from the docs. `findSkills(query)` scores
each skill by where the query terms hit (title 5, path 3, summary 2) and returns the best matches.

## When creating vs. finding

1. **Find first.** If a skill already covers the task, load and follow it.
2. **Extend** an existing skill if it's close but missing a rule (e.g. a new genre extension of
   `craft.md`).
3. **Create** a new skill only when nothing fits — drop a `# Title` + one-line summary `.md` under the
   right category (`skills/<category>/`), and it's discoverable immediately. Add a row to
   `skills/INDEX.md` so humans see it too.

This is the "find-skills" capability: reuse the top skills, take inspiration where partial, and only
author what's genuinely new — every skill stays usable and discoverable.
