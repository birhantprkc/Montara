"""Offline contract tests for TTS provider `build_request()` methods.

Each TTS provider exposes a pure `build_request(inputs, api_key)` that returns the
exact SUBMIT request (`method`/`url`/`headers`/`json`) `execute()` sends first —
no network, no real keys. These tests lock the endpoint, auth header, and the
prompt/text + model/voice/default payload so a refactor can't silently drift the
submit shape.
"""

from __future__ import annotations

from tools.audio.doubao_tts import DoubaoTTS
from tools.audio.elevenlabs_tts import ElevenLabsTTS
from tools.audio.google_tts import GoogleTTS
from tools.audio.openai_tts import OpenAITTS


def _schema_default(tool, prop: str):
    return tool.input_schema["properties"][prop]["default"]


def test_elevenlabs_tts_build_request_submit_shape():
    tool = ElevenLabsTTS()
    req = tool.build_request({"text": "Hello narration"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    # Submit endpoint targets the default (Rachel) voice id.
    assert req["url"] == (
        f"https://api.elevenlabs.io/v1/text-to-speech/{tool.DEFAULT_VOICE_ID}"
    )
    # ElevenLabs authenticates via the xi-api-key header (not Bearer).
    assert req["headers"]["xi-api-key"] == "TEST_KEY"
    assert req["headers"]["Content-Type"] == "application/json"
    assert req["headers"]["Accept"] == "audio/mpeg"
    # Payload carries the text and the schema default model_id.
    assert req["json"]["text"] == "Hello narration"
    assert req["json"]["model_id"] == _schema_default(tool, "model_id")
    assert req["json"]["model_id"] == "eleven_multilingual_v2"
    assert req["json"]["voice_settings"]["stability"] == 0.5


def test_elevenlabs_tts_build_request_honours_explicit_voice():
    tool = ElevenLabsTTS()
    req = tool.build_request(
        {"text": "hi", "voice_id": "customVoice123"}, api_key="TEST_KEY"
    )
    assert req["url"] == "https://api.elevenlabs.io/v1/text-to-speech/customVoice123"


def test_openai_tts_build_request_submit_shape():
    tool = OpenAITTS()
    req = tool.build_request({"text": "Read this line"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    assert req["url"] == "https://api.openai.com/v1/audio/speech"
    # OpenAI authenticates via Bearer.
    assert req["headers"]["Authorization"] == "Bearer TEST_KEY"
    assert req["headers"]["Content-Type"] == "application/json"
    # Text lives in the `input` field for the speech endpoint.
    assert req["json"]["input"] == "Read this line"
    # Model + voice default to the schema defaults (gpt-4o-mini-tts / alloy).
    assert req["json"]["model"] == _schema_default(tool, "model")
    assert req["json"]["model"] == "gpt-4o-mini-tts"
    assert req["json"]["voice"] == _schema_default(tool, "voice")
    assert req["json"]["voice"] == "alloy"
    assert req["json"]["response_format"] == "mp3"
    # Optional fields are omitted unless supplied.
    assert "instructions" not in req["json"]
    assert "speed" not in req["json"]


def test_google_tts_build_request_default_voice_uses_beta_endpoint():
    tool = GoogleTTS()
    req = tool.build_request({"text": "Localized line"}, api_key="TEST_KEY")

    assert req["method"] == "POST"
    # Default voice is a Chirp 3 HD voice → v1beta1 endpoint.
    assert req["url"] == "https://texttospeech.googleapis.com/v1beta1/text:synthesize"
    # Google API-key auth is carried in the `key` query param, not a header.
    assert req["params"]["key"] == "TEST_KEY"
    assert req["headers"]["Content-Type"] == "application/json"
    # Payload carries the text and the schema default voice name.
    assert req["json"]["input"]["text"] == "Localized line"
    assert req["json"]["voice"]["name"] == _schema_default(tool, "voice")
    assert req["json"]["voice"]["name"] == "en-US-Chirp3-HD-Orus"
    assert req["json"]["voice"]["languageCode"] == "en-US"
    assert req["json"]["audioConfig"]["audioEncoding"] == "MP3"


def test_google_tts_build_request_legacy_voice_uses_v1_endpoint():
    tool = GoogleTTS()
    req = tool.build_request(
        {"text": "hi", "voice": "en-US-Neural2-D"}, api_key="TEST_KEY"
    )
    # Non-Chirp/Journey voices resolve to the stable v1 endpoint.
    assert req["url"] == "https://texttospeech.googleapis.com/v1/text:synthesize"
    assert req["json"]["voice"]["name"] == "en-US-Neural2-D"


def test_doubao_tts_build_request_submit_shape():
    tool = DoubaoTTS()
    req = tool.build_request(
        {"text": "ni hao", "voice_id": "zh_female_test"}, api_key="TEST_KEY"
    )

    assert req["method"] == "POST"
    assert req["url"] == "https://openspeech.bytedance.com/api/v3/tts/submit"
    # Doubao authenticates via the X-Api-Key header.
    assert req["headers"]["X-Api-Key"] == "TEST_KEY"
    # Resource id defaults to the schema default (seed-tts-2.0).
    assert req["headers"]["X-Api-Resource-Id"] == _schema_default(tool, "resource_id")
    assert req["headers"]["X-Api-Resource-Id"] == "seed-tts-2.0"
    # Text + speaker (voice) live under req_params.
    assert req["json"]["req_params"]["text"] == "ni hao"
    assert req["json"]["req_params"]["speaker"] == "zh_female_test"
