# Publish Director - Kinetic Typography Pipeline

## Goal

Package the finished text-led video so the hook, metadata, and editor handoff all
preserve the same central phrase.

## Process

1. Pick a hook frame with the strongest readable phrase.
2. Write title/caption variants that do not merely repeat the on-screen text.
3. Export requested editor formats from the Timeline IR when available.
4. Include the HyperFrames workspace path when it is the editable native source.
5. Record any runtime-gated caveats in the publish notes.

## Output Requirements

- `publish_package` names the MP4, Timeline IR, render report, final review, and
  any editor exports.
- Thumbnail/copy options are text-led and platform-specific.
- The package is reproducible from local artifacts.
