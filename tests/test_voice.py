import asyncio
import base64
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from twilio.request_validator import RequestValidator

from errors import ServiceError
from main import create_app
from models import ChatResponse, HistoryMessage
from routers.voice import WELCOME, VoiceSession, valid_stream_signature
from services.stt import SpeechEvent

STREAM = "MZ" + "b" * 32
CALL = "CA" + "c" * 32


def start_event(settings):
    return {
        "event": "start",
        "streamSid": STREAM,
        "start": {
            "streamSid": STREAM,
            "callSid": CALL,
            "accountSid": settings.twilio_account_sid,
            "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
            "customParameters": {"caller_phone": "+14165551234"},
        },
    }


class FakeSTT:
    def __init__(self):
        self.events_queue = asyncio.Queue()
        self.received = []
        self.closed = False

    @asynccontextmanager
    async def connect(self):
        try:
            yield self
        finally:
            self.closed = True

    async def send_audio(self, audio):
        self.received.append(audio)
        await self.events_queue.put(SpeechEvent("speech_started"))
        await self.events_queue.put(SpeechEvent("final", "Book tomorrow", False))
        await self.events_queue.put(SpeechEvent("final", "at two", True))

    async def events(self):
        while True:
            yield await self.events_queue.get()

    async def keep_alive(self):
        await asyncio.Event().wait()


class FakeTTS:
    async def stream_voice_chunks(self, text):
        yield b"\xff" * 320


def test_signed_websocket_roundtrip_and_cleanup(settings):
    with TestClient(create_app(settings)) as client:
        stt = FakeSTT()
        client.app.state.stt = stt
        client.app.state.tts = FakeTTS()

        async def answer(body, on_sentence):
            assert body.message == "Book tomorrow at two"
            assert body.caller_phone == "+14165551234"
            await on_sentence("What name should I use?")
            return ChatResponse(
                reply="What name should I use?",
                tools_called=[],
                updated_history=[
                    *body.history,
                    HistoryMessage(role="user", content=body.message),
                    HistoryMessage(role="assistant", content="What name should I use?"),
                ],
            )

        brain = AsyncMock()
        brain.respond.side_effect = answer
        client.app.state.brain = brain
        signature = RequestValidator("test-twilio").compute_signature(
            settings.public_base_url + "/twilio/stream", {}
        )
        with client.websocket_connect(
            "/twilio/stream", headers={"X-Twilio-Signature": signature}
        ) as ws:
            ws.send_json({"event": "connected"})
            ws.send_json(start_event(settings))
            assert ws.receive_json()["event"] == "media"
            assert ws.receive_json()["event"] == "media"
            greeting_mark = ws.receive_json()
            assert greeting_mark["event"] == "mark"
            ws.send_json({"event": "mark", "streamSid": STREAM, "mark": greeting_mark["mark"]})
            ws.send_json(
                {
                    "event": "media",
                    "streamSid": STREAM,
                    "media": {
                        "track": "inbound",
                        "payload": base64.b64encode(b"\x7f" * 160).decode(),
                    },
                }
            )
            assert ws.receive_json()["event"] == "clear"
            audio = ws.receive_json()
            assert audio["streamSid"] == STREAM
            assert base64.b64decode(audio["media"]["payload"]) == b"\xff" * 160
            ws.receive_json()
            assert ws.receive_json()["event"] == "mark"
            ws.send_json({"event": "stop", "streamSid": STREAM})
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
        assert stt.received == [b"\x7f" * 160]
        assert stt.closed
        assert client.app.state.active_calls == 0
        brain.respond.assert_awaited_once()


def test_unsigned_websocket_is_rejected(settings):
    with TestClient(create_app(settings)) as client:
        with (
            pytest.raises(WebSocketDisconnect) as error,
            client.websocket_connect("/twilio/stream"),
        ):
            pass
        assert error.value.code == 1008
        assert client.app.state.active_calls == 0


def test_twilio_documented_trailing_slash_signature(settings):
    signature = RequestValidator("test-twilio").compute_signature(
        settings.public_base_url + "/twilio/stream/?region=us", {}
    )
    assert valid_stream_signature(settings, "/twilio/stream", "region=us", signature)
    assert not valid_stream_signature(settings, "/twilio/stream", "region=eu", signature)


async def test_barge_in_cancels_audio_but_preserves_booking_turn(settings):
    socket = AsyncMock()
    brain = AsyncMock()
    booking_started = asyncio.Event()
    finish_booking = asyncio.Event()

    async def answer(body, on_sentence):
        booking_started.set()
        await finish_booking.wait()
        await on_sentence("Your appointment is confirmed.")
        return ChatResponse(
            reply="Your appointment is confirmed.",
            tools_called=[],
            updated_history=[
                HistoryMessage(role="assistant", content="Your appointment is confirmed."),
            ],
        )

    brain.respond.side_effect = answer
    session = VoiceSession(socket, settings, brain, FakeSTT(), FakeTTS())
    session.stream_sid = STREAM
    session.turns.put_nowait(("Book it", 0, 0.0))
    worker = asyncio.create_task(session.respond())
    session.playback = asyncio.create_task(asyncio.Event().wait())
    try:
        await asyncio.wait_for(booking_started.wait(), 2)
        await session.interrupt()
        finish_booking.set()
        # History is assigned by the worker after the mock completes; poll the observable
        # state because there is deliberately no production-only test synchronization hook.
        async with asyncio.timeout(2):
            while session.history[0].content == WELCOME:  # noqa: ASYNC110
                await asyncio.sleep(0)
        assert "confirmed" in session.history[0].content
        assert session.sentences.empty()  # Stale confirmation is not spoken over the caller.
        assert session.playback.cancelled()
        socket.send_json.assert_awaited_with({"event": "clear", "streamSid": STREAM})
    finally:
        worker.cancel()
        await asyncio.gather(worker, session.playback, return_exceptions=True)


async def test_partial_final_segments_flush_on_empty_endpoint(settings):
    class Transcripts:
        async def events(self):
            yield SpeechEvent("final", "My name is Mona")
            yield SpeechEvent("utterance_end")

    session = VoiceSession(AsyncMock(), settings, AsyncMock(), FakeSTT(), FakeTTS())
    with pytest.raises(ServiceError, match="closed"):
        await session.transcribe(Transcripts())
    assert session.turns.get_nowait()[0] == "My name is Mona"
    assert session.turns.empty()
