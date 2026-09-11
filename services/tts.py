"""ElevenLabs HTTP streaming with native Twilio mu-law and browser-friendly MP3."""

import logging
from collections.abc import AsyncIterator
from typing import Literal

import httpx

from config import Settings
from errors import ServiceError

logger = logging.getLogger(__name__)
AudioFormat = Literal["ulaw_8000", "mp3_44100_128"]


class TTSService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client

    async def generate_voice_bytes(self, text: str) -> bytes:
        """Return raw, headerless 8 kHz mu-law (not an MP3/WAV container)."""
        return b"".join([chunk async for chunk in self.stream_voice_chunks(text)])

    async def stream_voice_chunks(
        self, text: str, output_format: AudioFormat = "ulaw_8000"
    ) -> AsyncIterator[bytes]:
        self.settings.require("elevenlabs")
        if not text.strip() or len(text) > 2000:
            raise ServiceError("invalid_text", "Provide 1–2000 characters of text.", 422)
        assert self.settings.elevenlabs_api_key
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.settings.elevenlabs_voice_id}/stream"
        received_audio = False
        try:
            async with self.client.stream(
                "POST",
                url,
                params={"output_format": output_format},
                headers={"xi-api-key": self.settings.elevenlabs_api_key.get_secret_value()},
                json={
                    "text": text,
                    "model_id": self.settings.elevenlabs_model,
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
                },
            ) as response:
                response.raise_for_status()
                # Do not request a large fixed chunk: that buffers time-to-first-audio.
                async for chunk in response.aiter_bytes():
                    if chunk:
                        received_audio = True
                        yield chunk
        except httpx.HTTPError as exc:
            logger.warning("elevenlabs_failed error_type=%s", type(exc).__name__)
            raise ServiceError(
                "tts_unavailable", "Speech synthesis is temporarily unavailable."
            ) from exc
        if not received_audio:
            raise ServiceError("tts_empty_audio", "Speech synthesis returned no audio.")
