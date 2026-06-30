"""OpenAI GPT Image generation (GPT Image 2 / GPT Image 1 / DALL-E 3)."""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

_DEFAULT_MODEL = "gpt-image-2"
_GPT_IMAGE_MODELS = {"gpt-image-2", "gpt-image-1"}


class OpenAIImage(BaseTool):
    name = "openai_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "openai"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []  # checked dynamically
    install_instructions = (
        "Set OPENAI_API_KEY to your OpenAI API key.\n"
        "  pip install openai"
    )
    agent_skills = ["flux-best-practices"]  # general image gen knowledge

    capabilities = ["generate_image", "generate_illustration", "text_to_image"]
    supports = {
        "complex_instructions": True,
        "text_in_image": True,
        "multiple_outputs": True,
    }
    best_for = [
        "complex multi-element compositions",
        "images with text/labels",
        "following detailed instructions accurately",
    ]
    not_good_for = ["offline generation", "budget-constrained projects at high quality"]

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "model": {
                "type": "string",
                "enum": ["gpt-image-2", "gpt-image-1", "dall-e-3"],
                "default": _DEFAULT_MODEL,
            },
            "size": {
                "type": "string",
                "enum": [
                    "1024x1024", "1536x1024", "1024x1536", "auto",
                    "1024x1792", "1792x1024",  # dall-e-3 only
                ],
                "default": "1024x1024",
            },
            "quality": {
                "type": "string",
                "enum": ["low", "medium", "high", "auto", "standard", "hd"],
                "default": "auto",
            },
            "output_format": {
                "type": "string",
                "enum": ["png", "jpeg", "webp"],
                "default": "png",
            },
            "n": {"type": "integer", "default": 1, "minimum": 1, "maximum": 4},
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["rate_limit", "timeout"])
    idempotency_key_fields = ["prompt", "size", "quality", "model"]
    side_effects = ["writes image file to output_path", "calls OpenAI API"]
    user_visible_verification = ["Inspect generated image for relevance and quality"]

    def get_status(self) -> ToolStatus:
        if os.environ.get("OPENAI_API_KEY"):
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", _DEFAULT_MODEL)
        quality = inputs.get("quality", "auto")
        n = inputs.get("n", 1)
        if model in _GPT_IMAGE_MODELS:
            cost_map = {"low": 0.006, "medium": 0.053, "high": 0.211, "auto": 0.053}
            return cost_map.get(quality, 0.042) * n
        # dall-e-3 fallback pricing
        quality_map = {"standard": 0.04, "hd": 0.08}
        return quality_map.get(quality, 0.04) * n

    def build_request(self, inputs: dict[str, Any], api_key: str) -> dict[str, Any]:
        model = inputs.get("model", _DEFAULT_MODEL)
        prompt = inputs["prompt"]
        size = inputs.get("size", "1024x1024")
        body: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "size": size,
            "n": inputs.get("n", 1),
        }
        if model in _GPT_IMAGE_MODELS:
            body["quality"] = inputs.get("quality", "auto")
            body["output_format"] = inputs.get("output_format", "png")
        else:
            quality = inputs.get("quality", "standard")
            body["quality"] = "standard" if quality in ("low", "medium", "high", "auto") else quality
            body["n"] = 1
            body["response_format"] = "b64_json"
        return {
            "method": "POST",
            "url": "https://api.openai.com/v1/images/generations",
            "headers": {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            "json": body,
        }

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        if not os.environ.get("OPENAI_API_KEY"):
            return ToolResult(
                success=False,
                error="OPENAI_API_KEY not set. " + self.install_instructions,
            )

        from openai import OpenAI

        start = time.time()
        client = OpenAI()

        try:
            body = self.build_request(inputs, api_key=os.environ["OPENAI_API_KEY"])["json"]
            response = client.images.generate(**body)

            image_data = base64.b64decode(response.data[0].b64_json)
            ext = inputs.get("output_format", "png")
            output_path = Path(inputs.get("output_path", f"generated_image.{ext}"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_data)

        except Exception as e:
            return ToolResult(success=False, error=f"OpenAI image generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "openai",
                "model": body["model"],
                "prompt": inputs["prompt"],
                "output": str(output_path),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=str(body["model"]),
        )
