"""Offline contract tests for VIDEO provider `build_request()` builders.

Each video provider tool exposes `build_request(inputs, api_key)` (Higgsfield
also takes `api_secret`) that returns the exact FIRST/submit request spec
(`{"method", "url", "headers", "json"}`) that `execute()` sends before any
polling or download. These tests call `build_request` directly with minimal
valid inputs and a fake key, asserting the submit endpoint, auth header, and
payload shape. They must pass with NO network and NO real API keys — a
`build_request` that made a network call or required a live key would fail here.

Mirrors the reference `build_request` tests in
`tests/tools/test_provider_model_defaults.py` (Runway / OpenAI).
"""

import tools.video.grok_video as grok_video
import tools.video.higgsfield_video as higgsfield_video
import tools.video.kling_video as kling_video
import tools.video.minimax_video as minimax_video
import tools.video.veo_video as veo_video
from tools.video.grok_video import GrokVideo
from tools.video.heygen_video import HeyGenVideo
from tools.video.higgsfield_video import HiggsFieldVideo
from tools.video.kling_video import KlingVideo
from tools.video.minimax_video import MiniMaxVideo
from tools.video.veo_video import VeoVideo

TEST_KEY = "TEST_KEY"


def _schema_default(tool, field: str):
    return tool.input_schema["properties"][field]["default"]


def test_kling_build_request_submits_to_fal_queue_with_key_auth():
    tool = KlingVideo()
    # Schema default variant/operation -> fal.ai queue submit endpoint.
    assert _schema_default(tool, "model_variant") == "v3/standard"

    req = tool.build_request({"prompt": "cinematic b-roll of a coastline"}, api_key=TEST_KEY)

    assert req["method"] == "POST"
    assert req["url"] == "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video"
    assert req["headers"]["Authorization"] == f"Key {TEST_KEY}"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "cinematic b-roll of a coastline"


def test_grok_build_request_submits_to_xai_with_bearer_auth():
    tool = GrokVideo()
    # Schema default model is the sole Grok Imagine Video model.
    assert _schema_default(tool, "model") == "grok-imagine-video"

    req = tool.build_request({"prompt": "a dog surfing at sunset"}, api_key=TEST_KEY)

    assert req["method"] == "POST"
    assert req["url"] == "https://api.x.ai/v1/videos/generations"
    assert req["headers"]["Authorization"] == f"Bearer {TEST_KEY}"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "a dog surfing at sunset"
    assert req["json"]["model"] == "grok-imagine-video"


def test_minimax_build_request_submits_to_fal_queue_with_key_auth():
    tool = MiniMaxVideo()
    # Schema default variant -> fal.ai queue submit endpoint (text-to-video path).
    assert _schema_default(tool, "model_variant") == "hailuo-02/pro"

    req = tool.build_request({"prompt": "a slow dolly across a desk"}, api_key=TEST_KEY)

    assert req["method"] == "POST"
    assert req["url"] == "https://queue.fal.run/fal-ai/minimax/hailuo-02/pro/text-to-video"
    assert req["headers"]["Authorization"] == f"Key {TEST_KEY}"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "a slow dolly across a desk"


def test_heygen_build_request_submits_to_workflow_endpoint_with_xapikey():
    tool = HeyGenVideo()
    # Schema default provider variant flows into the workflow input payload.
    assert _schema_default(tool, "provider_variant") == "veo_3_1"

    req = tool.build_request({"prompt": "an anchor introducing a segment"}, api_key=TEST_KEY)

    assert req["method"] == "POST"
    assert req["url"] == "https://api.heygen.com/v1/workflows/executions"
    assert req["headers"]["X-Api-Key"] == TEST_KEY
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["workflow_type"] == "GenerateVideoNode"
    assert req["json"]["input"]["prompt"] == "an anchor introducing a segment"
    assert req["json"]["input"]["provider"] == "veo_3_1"


def test_higgsfield_build_request_submits_to_platform_with_bearer_and_secret():
    tool = HiggsFieldVideo()
    # Schema default model must match the module constant used by execute().
    assert _schema_default(tool, "model") == higgsfield_video._DEFAULT_MODEL == "seedance_2.0"

    req = tool.build_request(
        {"prompt": "a cinematic teaser"}, api_key=TEST_KEY, api_secret="TEST_SECRET"
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://platform.higgsfield.ai/v1/generations"
    assert req["headers"]["Authorization"] == f"Bearer {TEST_KEY}"
    assert req["headers"]["X-API-Secret"] == "TEST_SECRET"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "a cinematic teaser"
    assert req["json"]["model"] == "seedance_2.0"
    assert req["json"]["task"] == "text-to-video"


def test_veo_build_request_submits_to_fal_queue_with_key_auth():
    tool = VeoVideo()
    # Schema default variant -> fal.ai queue submit endpoint (text-to-video path).
    assert _schema_default(tool, "model_variant") == "veo3.1"

    req = tool.build_request({"prompt": "a hummingbird in slow motion"}, api_key=TEST_KEY)

    assert req["method"] == "POST"
    assert req["url"] == "https://queue.fal.run/fal-ai/veo3.1"
    assert req["headers"]["Authorization"] == f"Key {TEST_KEY}"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["json"]["prompt"] == "a hummingbird in slow motion"
    # execute() reads optional fields straight from inputs; with none supplied the
    # payload carries only the prompt (byte-for-byte with the original submit).
    assert "duration" not in req["json"]

    # When duration IS supplied it flows through unchanged.
    req_with_duration = tool.build_request(
        {"prompt": "a hummingbird in slow motion", "duration": "8s"}, api_key=TEST_KEY
    )
    assert req_with_duration["json"]["duration"] == "8s"


# Silence unused-import lint for module handles kept for symmetry / future asserts.
_MODULES = (grok_video, kling_video, minimax_video, veo_video, higgsfield_video)
