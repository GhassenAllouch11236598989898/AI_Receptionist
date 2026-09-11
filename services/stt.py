"""Deepgram SDK v7: file transcription and asynchronous /v1/listen streaming."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Any, Literal

import httpx
from deepgram import AsyncDeepgramClient
from deepgram.core.api_error import ApiError
from deepgram.listen.v1.socket_client import AsyncV1SocketClient
from websockets.exceptions import WebSocketException

from config import Settings
from errors import ServiceError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SpeechEvent:
    kind: Literal["speech_started", "final", "utterance_end"]
    text: str = ""
    speech_final: bool = False


class DeepgramSession:
    def __init__(self, connection: AsyncV1SocketClient) -> None:
        self.connection = connection

    async def send_audio(self, audio: bytes) -> None:
        await self.connection.send_media(audio)

    async def keep_alive(self) -> None:
        while True:
            await asyncio.sleep(5)
            await self.connection.send_keep_alive()

    async def events(self) -> AsyncIterator[SpeechEvent]:
        # Deduplicate provider segments by timing, never by text: callers can repeat words.
        last_segment_end = -1.0
        async for message in self.connection:
            if isinstance(message, bytes):
                continue
            data = message if isinstance(message, dict) else message.model_dump()
            kind = data.get("type")
            if kind == "SpeechStarted":
                yield SpeechEvent("speech_started")
            elif kind == "UtteranceEnd":
                yield SpeechEvent("utterance_end")
            elif kind == "Results":
                alternatives = (data.get("channel") or {}).get("alternatives", [])
                text = (alternatives[0].get("transcript", "") if alternatives else "").strip()
                final = bool(data.get("is_final"))
                speech_final = bool(data.get("speech_final"))
                end = float(data.get("start", 0)) + float(data.get("duration", 0))
                if final and text and end > last_segment_end:
                    last_segment_end = end
                    yield SpeechEvent("final", text, speech_final)
                elif speech_final:
                    # An empty endpoint message must still flush previously finalized words.
                    yield SpeechEvent("utterance_end")
            elif kind == "Error":
                raise ServiceError("stt_stream_failed", "Live transcription failed.")


class STTService:
    def __init__(self, settings: Settings, client: AsyncDeepgramClient | None) -> None:
        self.settings = settings
        self.client = client

    async def transcribe_file(self, audio: bytes, content_type: str) -> dict[str, Any]:
        self.settings.require("deepgram")
        assert self.client
        try:
            result = await self.client.listen.v1.media.transcribe_file(
                request=audio,
                model=self.settings.deepgram_model,
                language=self.settings.deepgram_language,
                smart_format=True,
                request_options={
                    "max_retries": 0,
                    "timeout_in_seconds": self.settings.provider_timeout_seconds,
                    "additional_headers": {"content-type": content_type},
                },
            )
        except (ApiError, httpx.HTTPError) as exc:
            logger.warning("file_transcription_failed error_type=%s", type(exc).__name__)
            raise ServiceError("stt_unavailable", "Audio could not be transcribed.") from exc
        payload = result.model_dump()
        channels = (payload.get("results") or {}).get("channels", [])
        alternatives = channels[0].get("alternatives", []) if channels else []
        if not alternatives:
            raise ServiceError("stt_invalid_result", "Transcription returned no result.", 502)
        return {
            "transcript": alternatives[0].get("transcript", ""),
            "confidence": alternatives[0].get("confidence", 0),
            "duration_seconds": (payload.get("metadata") or {}).get("duration", 0),
        }

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[DeepgramSession]:
        self.settings.require("deepgram")
        assert self.client
        try:
            # SDK serializes these into wss://api.deepgram.com/v1/listen?... .
            async with self.client.listen.v1.connect(
                model=self.settings.deepgram_model,
                language=self.settings.deepgram_language,
                encoding="mulaw",
                sample_rate=8000,
                channels=1,
                endpointing=self.settings.deepgram_endpointing_ms,
                interim_results=True,
                vad_events=True,
                utterance_end_ms=1000,
                smart_format=True,
            ) as connection:
                try:
                    yield DeepgramSession(connection)
                finally:
                    with suppress(Exception):
                        async with asyncio.timeout(1):
                            await connection.send_close_stream()
        except (ApiError, httpx.HTTPError, WebSocketException) as exc:
            logger.warning("deepgram_stream_failed error_type=%s", type(exc).__name__)
            raise ServiceError(
                "stt_stream_unavailable", "Live transcription is unavailable."
            ) from exc
