"""Screen capture tools for Montara source footage.

Available routes:
- ``screen_recorder``: FFmpeg desktop/region recording for native apps.
- ``cap_recorder``: pickup for polished Cap recordings made by the user.
- ``playwright_recorder``: browser automation/capture with optional login
  ``storageState`` reuse for websites and SaaS products behind auth walls.
- ``screen_capture_selector``: capability-level router that chooses between
  those providers from the user's prompt and available runtime.
"""
