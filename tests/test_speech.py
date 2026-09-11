import json
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import httpx
from deepgram import AsyncDeepgramClient

from services.stt import DeepgramSession, STTService
from services.tts import TTSService


async def test_elevenlabs_native_audio_and_model(settings):
    def provider(request):
        assert request.headers["xi-api-key"] == "test-elevenlabs"
        assert request.url.params["output_format"] == "ulaw_8000"
        assert json.loads(request.content)["model_id"] == "eleven_turbo_v2_5"
        return httpx.Response(200, content=b"\xff" * 320)

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        assert await TTSService(settings, http).generate_voice_bytes("Hello!") == b"\xff" * 320


async def test_deepgram_file_sdk_uses_audio_bytes(settings):
    def provider(request):
        assert request.method == "POST"
        assert request.url.path == "/v1/listen"
        assert request.headers["Authorization"] == "Token test-deepgram"
        assert request.headers["Content-Type"] == "audio/wav"
        assert request.content == b"test-wave"
        return httpx.Response(
            200,
            json={
                "metadata": {"duration": 1.5},
                "results": {
                    "channels": [{"alternatives": [{"transcript": "Hello", "confidence": 0.9}]}]
                },
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        sdk = AsyncDeepgramClient(api_key="test-deepgram", httpx_client=http)
        result = await STTService(settings, sdk).transcribe_file(b"test-wave", "audio/wav")
    assert result["transcript"] == "Hello"
    assert result["duration_seconds"] == 1.5


async def test_deepgram_sdk_stream_url_and_final_event_handling(settings, monkeypatch):
    # Exercise the real SDK serialization and socket client without network or API charges.
    received = []
    provider_events = [
        {"type": "SpeechStarted", "channel": [0], "timestamp": 0},
        {
            "type": "Results",
            "is_final": False,
            "speech_final": False,
            "start": 0,
            "duration": 1,
            "channel": {"alternatives": [{"transcript": "Book"}]},
        },
        {
            "type": "Results",
            "is_final": True,
            "speech_final": False,
            "start": 0,
            "duration": 1,
            "channel": {"alternatives": [{"transcript": "Book tomorrow"}]},
        },
        {
            "type": "Results",
            "is_final": True,
            "speech_final": False,
            "start": 0,
            "duration": 1,
            "channel": {"alternatives": [{"transcript": "Book tomorrow"}]},
        },
        {
            "type": "Results",
            "is_final": True,
            "speech_final": True,
            "start": 1,
            "duration": 1,
            "channel": {"alternatives": [{"transcript": "at two"}]},
        },
        {
            "type": "Results",
            "is_final": True,
            "speech_final": True,
            "start": 2,
            "duration": 0.3,
            "channel": {"alternatives": [{"transcript": ""}]},
        },
    ]

    class Socket:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            received.append("closed")

        async def __aiter__(self):
            for event in provider_events:
                yield json.dumps(event)

        async def send(self, message):
            received.append(message)

    def connect(url, **kwargs):
        parsed = urlsplit(url)
        assert parsed.scheme == "wss" and parsed.netloc == "api.deepgram.com"
        assert parsed.path == "/v1/listen"
        query = parse_qs(parsed.query)
        assert query["encoding"] == ["mulaw"]
        assert query["sample_rate"] == ["8000"]
        assert query["channels"] == ["1"]
        assert query["endpointing"] == ["300"]
        assert kwargs["extra_headers"]["Authorization"] == "Token test-deepgram"
        return Socket()

    monkeypatch.setattr("deepgram.listen.v1.client.websockets_client_connect", connect)
    async with httpx.AsyncClient() as http:
        stt = STTService(settings, AsyncDeepgramClient(api_key="test-deepgram", httpx_client=http))
        async with stt.connect() as connection:
            await connection.send_audio(b"\xff" * 160)
            result = [event async for event in connection.events()]
    assert [(event.kind, event.text) for event in result] == [
        ("speech_started", ""),
        ("final", "Book tomorrow"),
        ("final", "at two"),
        ("utterance_end", ""),
    ]
    assert result[2].speech_final is True
    assert received[0] == b"\xff" * 160
    assert json.loads(received[-2]) == {"type": "CloseStream"}
    assert received[-1] == "closed"


async def test_keep_alive_uses_sdk_control_message(monkeypatch):
    connection = AsyncMock()
    session = DeepgramSession(connection)

    async def no_wait(_):
        if connection.send_keep_alive.await_count:
            raise RuntimeError("stop test")

    monkeypatch.setattr("services.stt.asyncio.sleep", no_wait)
    try:
        await session.keep_alive()
    except RuntimeError:
        pass
    connection.send_keep_alive.assert_awaited_once_with()
