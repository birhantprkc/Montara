"""Offline contract tests for MUSIC providers' `build_request()`.

`build_request()` must reproduce EXACTLY the submit/generation request that
`execute()` sends — the endpoint URL, the auth header (name + scheme), and the
payload (prompt/lyrics + model/duration) — without ever touching the network.
These tests run fully offline with a fake API key: `build_request` is pure, so
no real key and no HTTP call are involved.
"""

from __future__ import annotations

from tools.audio.music_gen import MusicGen
from tools.audio.suno_music import SunoMusic


def test_suno_music_build_request_uses_generate_submit_shape():
    tool = SunoMusic()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    req = tool.build_request(
        {"prompt": "warm ambient background pad"},
        api_key="TEST_KEY",
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://api.sunoapi.org/api/v1/generate"
    # Suno uses Bearer auth on the standard Authorization header.
    assert req["headers"]["Authorization"] == "Bearer TEST_KEY"
    assert req["headers"]["Content-Type"] == "application/json"
    # Simple (non-custom) mode: prompt is a description, model = schema default.
    assert req["json"]["model"] == schema_default == "V4"
    assert req["json"]["prompt"] == "warm ambient background pad"
    assert req["json"]["customMode"] is False
    assert req["json"]["instrumental"] is True
    assert req["json"]["callBackUrl"] == ""


def test_suno_music_build_request_custom_mode_sends_lyrics_style_title():
    tool = SunoMusic()

    req = tool.build_request(
        {
            "prompt": "la la la exact lyrics here",
            "style": "upbeat electronic pop",
            "title": "My Track",
            "custom_mode": True,
            "instrumental": False,
            "model": "V5",
        },
        api_key="TEST_KEY",
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://api.sunoapi.org/api/v1/generate"
    assert req["headers"]["Authorization"] == "Bearer TEST_KEY"
    assert req["json"]["model"] == "V5"
    assert req["json"]["customMode"] is True
    assert req["json"]["instrumental"] is False
    assert req["json"]["prompt"] == "la la la exact lyrics here"
    assert req["json"]["style"] == "upbeat electronic pop"
    assert req["json"]["title"] == "My Track"


def test_music_gen_build_request_uses_elevenlabs_music_shape():
    tool = MusicGen()

    req = tool.build_request(
        {"prompt": "tense cinematic underscore", "duration_seconds": 30},
        api_key="TEST_KEY",
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://api.elevenlabs.io/v1/music"
    # ElevenLabs authenticates via the xi-api-key header (not a Bearer token).
    assert req["headers"]["xi-api-key"] == "TEST_KEY"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "tense cinematic underscore"
    # Duration is forwarded in milliseconds.
    assert req["json"]["music_length_ms"] == 30_000
