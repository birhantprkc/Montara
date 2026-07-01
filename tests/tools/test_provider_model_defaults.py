"""Regression: a provider's code-level model default must match its schema's
declared `model.default`.

Bug: runway_video and higgsfield_video hardcoded stale model defaults in
estimate_cost/estimate_runtime/execute (`gen4_turbo` / `kling_3.0`) while the
schema advertised a different default. Omitting `model` then
quoted the wrong (cheap) model's cost and silently generated a different model
than the schema promised — a Decision-Communication / cost-accuracy violation.
"""

import pytest

import tools.video.higgsfield_video as higgsfield_video
import tools.graphics.flux_image as flux_image
import tools.graphics.openai_image as openai_image
import tools.video.runway_video as runway_video
from tools.graphics.flux_image import FluxImage
from tools.graphics.openai_image import OpenAIImage
from tools.video.higgsfield_video import HiggsFieldVideo
from tools.video.runway_video import RunwayVideo


@pytest.mark.parametrize(
    "tool_cls, module",
    [(RunwayVideo, runway_video), (HiggsFieldVideo, higgsfield_video)],
)
def test_default_model_constant_matches_schema(tool_cls, module):
    # `execute()` reads `model` via `_DEFAULT_MODEL`; locking the constant to the
    # schema default guards the silent-model-swap path without a network call.
    schema_default = tool_cls().input_schema["properties"]["model"]["default"]
    assert module._DEFAULT_MODEL == schema_default


@pytest.mark.parametrize("tool_cls", [RunwayVideo, HiggsFieldVideo])
def test_estimate_default_model_matches_schema(tool_cls):
    tool = tool_cls()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    # Cost/runtime with `model` omitted must equal the schema's declared default,
    # not some stale hardcoded fallback.
    assert tool.estimate_cost({}) == tool.estimate_cost({"model": schema_default}), (
        f"{tool.name}.estimate_cost default model diverges from schema default "
        f"{schema_default!r}"
    )
    assert tool.estimate_runtime({}) == tool.estimate_runtime({"model": schema_default}), (
        f"{tool.name}.estimate_runtime default model diverges from schema default "
        f"{schema_default!r}"
    )


def test_runway_video_build_request_uses_current_gen45_task_shape():
    req = RunwayVideo().build_request(
        {"prompt": "cinematic software trailer", "duration": 5, "ratio": "16:9"},
        api_key="RUNWAY_TEST",
    )

    assert runway_video._DEFAULT_MODEL == "gen4.5"
    assert req["method"] == "POST"
    assert req["url"] == "https://api.dev.runwayml.com/v1/image_to_video"
    assert req["headers"]["Authorization"] == "Bearer RUNWAY_TEST"
    assert req["headers"]["X-Runway-Version"] == "2024-11-06"
    assert req["json"]["model"] == "gen4.5"
    assert req["json"]["promptText"] == "cinematic software trailer"
    assert "promptImage" not in req["json"]


def test_openai_image_default_model_matches_schema():
    tool = OpenAIImage()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    assert openai_image._DEFAULT_MODEL == schema_default == "gpt-image-2"
    assert tool.estimate_cost({}) == tool.estimate_cost({"model": schema_default})


def test_openai_image_build_request_uses_gpt_image_2_shape():
    req = OpenAIImage().build_request({"prompt": "a clean product frame"}, api_key="OPENAI_TEST")

    assert req["method"] == "POST"
    assert req["url"] == "https://api.openai.com/v1/images/generations"
    assert req["headers"]["Authorization"] == "Bearer OPENAI_TEST"
    assert req["json"]["model"] == "gpt-image-2"
    assert req["json"]["quality"] == "auto"
    assert req["json"]["output_format"] == "png"
    assert "response_format" not in req["json"]


def test_flux_image_default_model_matches_schema():
    tool = FluxImage()
    schema_default = tool.input_schema["properties"]["model"]["default"]

    assert flux_image._DEFAULT_MODEL == schema_default == "flux-2-pro-preview"
    assert tool.estimate_cost({}) == tool.estimate_cost({"model": schema_default})


def test_flux_image_build_bfl_request_uses_direct_bfl_shape():
    req = FluxImage().build_bfl_request(
        {"prompt": "cinematic mountain dawn", "width": 512, "height": 768, "seed": 123},
        api_key="BFL_TEST",
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://api.bfl.ai/v1/flux-2-pro-preview"
    assert req["headers"]["x-key"] == "BFL_TEST"
    assert req["json"] == {
        "prompt": "cinematic mountain dawn",
        "width": 512,
        "height": 768,
        "seed": 123,
    }


def test_flux_image_fal_fallback_maps_flux2_default_to_legacy_fal_model():
    req = FluxImage().build_fal_request(
        {"prompt": "cinematic mountain dawn", "model": "flux-2-pro-preview"},
        api_key="FAL_TEST",
    )

    assert req["url"] == "https://fal.run/fal-ai/flux-pro/v1.1"
    assert req["headers"]["Authorization"] == "Key FAL_TEST"
    assert req["json"]["image_size"] == {"width": 1024, "height": 1024}
