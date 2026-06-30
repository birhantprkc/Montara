"""FLUX image generation via direct BFL API, with fal.ai compatibility fallback."""

from __future__ import annotations

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

_DEFAULT_MODEL = "flux-2-pro-preview"
_BFL_ENDPOINTS = {
    "flux-2-pro-preview": "https://api.bfl.ai/v1/flux-2-pro-preview",
}
_FAL_FALLBACK_MODEL = "flux-pro/v1.1"


class FluxImage(BaseTool):
    name = "flux_image"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "flux"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.SEEDED
    runtime = ToolRuntime.API

    dependencies = []  # checked dynamically via env var
    install_instructions = (
        "Set BFL_API_KEY for direct Black Forest Labs FLUX.2.\n"
        "  Get one at https://dashboard.bfl.ai/get-started\n"
        "Fallback: set FAL_KEY or FAL_AI_API_KEY for the legacy fal.ai FLUX path."
    )
    agent_skills = ["flux-best-practices", "bfl-api"]

    capabilities = ["generate_image", "generate_illustration", "text_to_image"]
    supports = {
        "negative_prompt": True,
        "seed": True,
        "custom_size": True,
    }
    best_for = [
        "photorealistic images",
        "general-purpose image generation",
        "high quality at low cost (~$0.03/image)",
    ]
    not_good_for = ["text rendering in images", "offline generation"]

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "negative_prompt": {"type": "string", "default": ""},
            "width": {"type": "integer", "default": 1024},
            "height": {"type": "integer", "default": 1024},
            "model": {
                "type": "string",
                "enum": ["flux-2-pro-preview", "flux-pro/v1.1", "flux/dev", "flux-pro"],
                "default": _DEFAULT_MODEL,
            },
            "seed": {"type": "integer"},
            "num_inference_steps": {"type": "integer"},
            "guidance_scale": {"type": "number"},
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["rate_limit", "timeout"])
    idempotency_key_fields = ["prompt", "width", "height", "seed", "model"]
    side_effects = ["writes image file to output_path", "calls BFL or fal.ai API"]
    user_visible_verification = ["Inspect generated image for relevance and quality"]

    def _get_bfl_api_key(self) -> str | None:
        return os.environ.get("BFL_API_KEY")

    def _get_fal_api_key(self) -> str | None:
        return os.environ.get("FAL_KEY") or os.environ.get("FAL_AI_API_KEY")

    def get_status(self) -> ToolStatus:
        if self._get_bfl_api_key() or self._get_fal_api_key():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        model = inputs.get("model", _DEFAULT_MODEL)
        if str(model).startswith("flux-2"):
            return 0.03
        if "pro" in model:
            return 0.05
        return 0.03  # dev tier

    def _base_payload(self, inputs: dict[str, Any]) -> dict[str, Any]:
        width = inputs.get("width", 1024)
        height = inputs.get("height", 1024)
        payload: dict[str, Any] = {
            "prompt": inputs["prompt"],
            "width": width,
            "height": height,
        }
        if inputs.get("seed") is not None:
            payload["seed"] = inputs["seed"]
        return payload

    def build_bfl_request(self, inputs: dict[str, Any], api_key: str) -> dict[str, Any]:
        model = inputs.get("model", _DEFAULT_MODEL)
        endpoint = _BFL_ENDPOINTS.get(str(model), _BFL_ENDPOINTS[_DEFAULT_MODEL])
        return {
            "method": "POST",
            "url": endpoint,
            "headers": {"x-key": api_key, "Content-Type": "application/json"},
            "json": self._base_payload(inputs),
        }

    def build_fal_request(self, inputs: dict[str, Any], api_key: str) -> dict[str, Any]:
        model = inputs.get("model", _FAL_FALLBACK_MODEL)
        if str(model).startswith("flux-2"):
            model = _FAL_FALLBACK_MODEL
        width = inputs.get("width", 1024)
        height = inputs.get("height", 1024)
        payload: dict[str, Any] = {
            "prompt": inputs["prompt"],
            "image_size": {"width": width, "height": height},
        }
        if inputs.get("seed") is not None:
            payload["seed"] = inputs["seed"]
        if inputs.get("num_inference_steps"):
            payload["num_inference_steps"] = inputs["num_inference_steps"]
        if inputs.get("guidance_scale"):
            payload["guidance_scale"] = inputs["guidance_scale"]
        if inputs.get("negative_prompt"):
            payload["negative_prompt"] = inputs["negative_prompt"]
        return {
            "method": "POST",
            "url": f"https://fal.run/fal-ai/{model}",
            "headers": {"Authorization": f"Key {api_key}", "Content-Type": "application/json"},
            "json": payload,
        }

    def _execute_bfl(self, inputs: dict[str, Any], api_key: str, start: float) -> ToolResult:
        import requests

        req = self.build_bfl_request(inputs, api_key)
        try:
            response = requests.post(
                req["url"],
                headers=req["headers"],
                json=req["json"],
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            polling_url = data.get("polling_url")
            if not polling_url:
                return ToolResult(success=False, error="BFL response missing polling_url")

            result_data: dict[str, Any] | None = None
            for _ in range(240):
                time.sleep(0.5)
                status_response = requests.get(polling_url, headers={"x-key": api_key}, timeout=15)
                status_response.raise_for_status()
                polled = status_response.json()
                status = str(polled.get("status", "")).lower()
                if status == "ready":
                    result_data = polled
                    break
                if status in {"error", "failed"}:
                    return ToolResult(success=False, error=f"BFL generation {status}: {polled.get('error', 'unknown error')}")
            if result_data is None:
                return ToolResult(success=False, error="BFL generation timed out")

            image_url = result_data["result"]["sample"]
            image_response = requests.get(image_url, timeout=60)
            image_response.raise_for_status()

            output_path = Path(inputs.get("output_path", "generated_image.png"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_response.content)

        except Exception as e:
            return ToolResult(success=False, error=f"FLUX generation failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "flux",
                "provider_route": "bfl",
                "model": inputs.get("model", _DEFAULT_MODEL),
                "prompt": inputs["prompt"],
                "output": str(output_path),
                "seed": result_data.get("seed") or result_data.get("result", {}).get("seed"),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            seed=result_data.get("seed") or result_data.get("result", {}).get("seed"),
            model=str(inputs.get("model", _DEFAULT_MODEL)),
        )

    def _execute_fal(self, inputs: dict[str, Any], api_key: str, start: float) -> ToolResult:
        import requests

        req = self.build_fal_request(inputs, api_key)
        try:
            response = requests.post(
                req["url"],
                headers=req["headers"],
                json=req["json"],
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

            image_url = data["images"][0]["url"]
            image_response = requests.get(image_url, timeout=60)
            image_response.raise_for_status()

            output_path = Path(inputs.get("output_path", "generated_image.png"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(image_response.content)

        except Exception as e:
            return ToolResult(success=False, error=f"FLUX generation failed: {e}")

        model = req["url"].rsplit("/", 1)[-1]
        return ToolResult(
            success=True,
            data={
                "provider": "flux",
                "provider_route": "fal",
                "model": model,
                "prompt": inputs["prompt"],
                "output": str(output_path),
                "seed": data.get("seed"),
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            seed=data.get("seed"),
            model=f"fal-ai/{model}",
        )

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        bfl_key = self._get_bfl_api_key()
        if bfl_key:
            return self._execute_bfl(inputs, bfl_key, start)

        fal_key = self._get_fal_api_key()
        if fal_key:
            return self._execute_fal(inputs, fal_key, start)

        return ToolResult(
            success=False,
            error="No BFL_API_KEY, FAL_KEY, or FAL_AI_API_KEY found. " + self.install_instructions,
        )
