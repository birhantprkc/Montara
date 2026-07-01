"""Contract tests for build_request() on Montara IMAGE providers.

Each provider's build_request(inputs, api_key) must reconstruct EXACTLY the
first/submit request execute() sends — endpoint URL, auth header (name +
scheme), and payload (prompt + model/default) — without touching the network
or requiring a real API key. These run fully offline: build_request is pure.
"""

from __future__ import annotations

from tools.graphics.google_imagen import GoogleImagen
from tools.graphics.grok_image import GrokImage
from tools.graphics.recraft_image import RecraftImage


def test_google_imagen_build_request_uses_ai_studio_shape():
    tool = GoogleImagen()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    req = tool.build_request({"prompt": "a photorealistic mountain lake"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    assert schema_default == "imagen-4.0-generate-001"
    assert req["url"] == (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{schema_default}:predict"
    )
    # AI Studio auth uses the x-goog-api-key header (not a Bearer scheme).
    assert req["headers"]["x-goog-api-key"] == "TEST_KEY"
    assert "Authorization" not in req["headers"]
    assert req["json"]["instances"] == [{"prompt": "a photorealistic mountain lake"}]
    assert req["json"]["parameters"]["aspectRatio"] == "1:1"
    assert req["json"]["parameters"]["sampleCount"] == 1


def test_grok_image_build_request_uses_generations_shape():
    tool = GrokImage()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    req = tool.build_request({"prompt": "neon skyline at dusk"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    assert schema_default == "grok-imagine-image"
    # No source images -> text-to-image generations endpoint.
    assert req["url"] == "https://api.x.ai/v1/images/generations"
    assert req["headers"]["Authorization"] == "Bearer TEST_KEY"
    assert req["json"]["model"] == schema_default
    assert req["json"]["prompt"] == "neon skyline at dusk"


def test_grok_image_build_request_edit_mode_uses_edits_endpoint():
    # A source image url flips the resolved endpoint to /images/edits, and that
    # resolution must stay inside build_request.
    req = GrokImage().build_request(
        {"prompt": "make it snow", "image_url": "https://example.com/a.png"},
        api_key="TEST_KEY",
    )

    assert req["url"] == "https://api.x.ai/v1/images/edits"
    assert req["json"]["image"] == {"url": "https://example.com/a.png", "type": "image_url"}


def test_recraft_image_build_request_uses_fal_v4_shape():
    tool = RecraftImage()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    req = tool.build_request({"prompt": "a minimalist logo"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    assert schema_default == "v4"
    assert req["url"] == "https://fal.run/fal-ai/recraft/v4/text-to-image"
    # fal.ai uses the "Key <token>" auth scheme, not Bearer.
    assert req["headers"]["Authorization"] == "Key TEST_KEY"
    assert req["json"]["prompt"] == "a minimalist logo"
