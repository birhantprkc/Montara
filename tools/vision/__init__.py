"""Local vision workers: matting, segmentation, and detection.

Each worker is invoked as a subprocess by the TypeScript `@montara/vision` package and
speaks one JSON contract on stdout:

    {"success": bool, "unavailable": bool, "error": str, "data": {...}, "artifacts": [...]}

Workers exit 0 even when a runtime or checkpoint is missing, reporting
``unavailable: true`` so the caller can degrade instead of hard-failing. They never
choose a model tier and never download weights unless the caller explicitly passed
``--allow-download`` after clearing the hardware gate in ``@montara/runtimes``.
"""
