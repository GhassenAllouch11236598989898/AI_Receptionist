"""Twilio bidirectional Media Streams with bounded queues and interruptible playback."""

import asyncio
import base64
import binascii
import json
import logging
import re
import time
from contextlib import aclosing, suppress
from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from starlette.datastructures import FormData
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import Connect, VoiceResponse

from config import Settings
from errors import ServiceError
from models import ChatRequest, HistoryMessage
from services.brain import BrainService
from services.stt import DeepgramSession, STTService
from services.tts import TTSService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/twilio", tags=["Twilio"])
WELCOME = "Hello! Thanks for calling. How can I assist you with scheduling today?"
PHONE = re.compile(r"^\+[1-9]\d{7,14}$")
SID = re.compile(r"^[A-Z]{2}[a-fA-F0-9]{32}$")


def external_url(settings: Settings, path: str, query: str = "") -> str:
    if not settings.public_base_url:
        raise ServiceError("not_configured", "Configure PUBLIC_BASE_URL for Twilio.")
    return settings.public_base_url + path + (f"?{query}" if query else "")


def valid_signature(
    settings: Settings, url: str, signature: str | None, params: FormData | dict
) -> bool:
    if not settings.twilio_validate_signatures:
        return True
    if not settings.twilio_auth_token or not signature:
        return False
    return RequestValidator(settings.twilio_auth_token.get_secret_value()).validate(
        url, params, signature
    )


def valid_stream_signature(
    settings: Settings, path: str, query: str, signature: str | None
) -> bool:
    # Twilio documents a trailing-slash normalization for Voice WSS handshakes.
    # Both candidates are built from our configured origin, never caller-supplied hosts.
    return any(
        valid_signature(settings, external_url(settings, candidate, query), signature, {})
        for candidate in (path, path.rstrip("/") + "/")
    )


@router.post(
    "/incoming", response_class=Response, responses={200: {"content": {"application/xml": {}}}}
)
async def incoming(request: Request) -> Response:
    """Configure this POST webhook on your Twilio phone number. Twilio signs the request."""
    settings: Settings = request.app.state.settings
    async with request.form(max_files=0, max_fields=100) as form:
        if not valid_signature(
            settings,
            external_url(settings, request.url.path, request.url.query),
            request.headers.get("x-twilio-signature"),
            form,
        ):
            raise HTTPException(403, "Invalid Twilio signature.")
        caller = str(form.get("From", ""))
    response = VoiceResponse()
    connect = Connect()
    url = external_url(settings, "/twilio/stream").replace("https://", "wss://", 1)
    url = url.replace("http://", "ws://", 1)
    stream = connect.stream(url=url)
    if PHONE.fullmatch(caller):
        stream.parameter(name="caller_phone", value=caller)
    response.append(connect)
    response.say("Sorry, the receptionist is unavailable right now. Please call again later.")
    response.hangup()
    return Response(str(response), media_type="application/xml")


class CallEnded(Exception):
    """Normal Twilio stop, as distinct from a provider failure."""


class VoiceSession:
    def __init__(
        self,
        websocket: WebSocket,
        settings: Settings,
        brain: BrainService,
        stt: STTService,
        tts: TTSService,
    ) -> None:
        self.websocket = websocket
        self.settings = settings
        self.brain = brain
        self.stt = stt
        self.tts = tts
        self.stream_sid = ""
        self.call_sid = ""
        self.caller_phone: str | None = None
        self.started_at = time.monotonic()
        self.history = [HistoryMessage(role="assistant", content=WELCOME)]
        self.audio: asyncio.Queue[bytes] = asyncio.Queue(maxsize=250)
        self.turns: asyncio.Queue[tuple[str, int, float]] = asyncio.Queue(maxsize=8)
        self.sentences: asyncio.Queue[tuple[str, int, float | None]] = asyncio.Queue(maxsize=16)
        self.generation = 0
        self.playback: asyncio.Task | None = None
        self.sending = asyncio.Lock()
        self.pending_marks: set[str] = set()
        self.mark_counter = 0
        self.latency_generation: int | None = None

    async def receive_event(self) -> dict[str, Any]:
        raw = await self.websocket.receive_text()
        if len(raw) > 65536:
            raise ServiceError("invalid_stream", "Twilio message is too large.", 400)
        try:
            event = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ServiceError("invalid_stream", "Invalid Twilio JSON.", 400) from exc
        if not isinstance(event, dict):
            raise ServiceError("invalid_stream", "Expected a Twilio event object.", 400)
        return event

    async def start(self) -> None:
        async with asyncio.timeout(10):
            while True:
                event = await self.receive_event()
                if event.get("event") == "connected":
                    continue
                if event.get("event") != "start":
                    raise ServiceError("invalid_stream", "Expected a Twilio start event.", 400)
                start = event.get("start", {})
                self.stream_sid = start.get("streamSid", "")
                self.call_sid = start.get("callSid", "")
                if (
                    not SID.fullmatch(self.stream_sid)
                    or not self.stream_sid.startswith("MZ")
                    or not SID.fullmatch(self.call_sid)
                    or not self.call_sid.startswith("CA")
                ):
                    raise ServiceError("invalid_stream", "Invalid Twilio stream identifiers.", 400)
                if (
                    self.settings.twilio_account_sid
                    and start.get("accountSid") != self.settings.twilio_account_sid
                ):
                    raise ServiceError("invalid_stream", "Unexpected Twilio account.", 403)
                audio_format = start.get("mediaFormat", {})
                if audio_format != {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}:
                    raise ServiceError("invalid_stream", "Expected mono 8 kHz mu-law audio.", 400)
                caller = start.get("customParameters", {}).get("caller_phone", "")
                self.caller_phone = (
                    caller if isinstance(caller, str) and PHONE.fullmatch(caller) else None
                )
                logger.info(
                    "call_started call_sid=%s stream_sid=%s", self.call_sid, self.stream_sid
                )
                return

    async def run(self) -> None:
        tasks: list[asyncio.Task] = []
        try:
            async with asyncio.timeout(self.settings.max_call_seconds):
                await self.start()
                self.sentences.put_nowait((WELCOME, self.generation, None))
                # Begin the greeting while Deepgram establishes its connection.
                tasks.append(asyncio.create_task(self.speak(), name="twilio-playback"))
                tasks.append(asyncio.create_task(self.receive_audio(), name="twilio-receive"))
                async with self.stt.connect() as deepgram:
                    tasks.extend(
                        [
                            asyncio.create_task(self.send_audio(deepgram), name="deepgram-send"),
                            asyncio.create_task(self.transcribe(deepgram), name="deepgram-receive"),
                            asyncio.create_task(deepgram.keep_alive(), name="deepgram-keepalive"),
                            asyncio.create_task(self.respond(), name="mia-turns"),
                        ]
                    )
                    try:
                        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                        for task in done:
                            task.result()
                    finally:
                        # Stop send/receive tasks BEFORE closing the Deepgram socket.
                        await self.cancel_tasks(tasks)
        except (CallEnded, WebSocketDisconnect):
            pass
        finally:
            await self.cancel_tasks(tasks)
            if self.playback:
                self.playback.cancel()
                await asyncio.gather(self.playback, return_exceptions=True)
            logger.info(
                "call_ended call_sid=%s duration_seconds=%.2f",
                self.call_sid,
                time.monotonic() - self.started_at,
            )

    @staticmethod
    async def cancel_tasks(tasks: list[asyncio.Task]) -> None:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def receive_audio(self) -> None:
        while True:
            event = await self.receive_event()
            if event.get("streamSid") not in {None, self.stream_sid}:
                raise ServiceError("invalid_stream", "Stream identifier changed.", 400)
            kind = event.get("event")
            if kind == "media":
                media = event.get("media", {})
                if media.get("track", "inbound") != "inbound":
                    continue
                try:
                    audio = base64.b64decode(media.get("payload", ""), validate=True)
                except (binascii.Error, ValueError, TypeError) as exc:
                    raise ServiceError("invalid_audio", "Invalid base64 audio.", 400) from exc
                if not audio or len(audio) > 8000:
                    raise ServiceError("invalid_audio", "Invalid audio frame size.", 400)
                try:
                    self.audio.put_nowait(audio)
                except asyncio.QueueFull as exc:
                    raise ServiceError("voice_overloaded", "Audio processing fell behind.") from exc
            elif kind == "mark":
                self.pending_marks.discard(event.get("mark", {}).get("name", ""))
            elif kind == "stop":
                raise CallEnded()
            elif kind == "start":
                raise ServiceError("invalid_stream", "Duplicate start event.", 400)

    async def send_audio(self, deepgram: DeepgramSession) -> None:
        while True:
            await deepgram.send_audio(await self.audio.get())

    async def interrupt(self) -> None:
        self.generation += 1
        if self.playback and not self.playback.done():
            self.playback.cancel()
        # Serialize clear after any currently sending media packet.
        await self.send({"event": "clear"})
        self.pending_marks.clear()

    async def transcribe(self, deepgram: DeepgramSession) -> None:
        fragments: list[str] = []
        speaking = False
        async for event in deepgram.events():
            if event.kind == "speech_started":
                if not speaking:
                    await self.interrupt()
                speaking = True
            elif event.kind == "final":
                if not speaking:
                    await self.interrupt()
                    speaking = True
                fragments.append(event.text)
                if sum(map(len, fragments)) > 2000:
                    raise ServiceError("utterance_too_long", "Caller utterance exceeds limit.", 400)
            if event.kind == "utterance_end" or event.speech_final:
                if fragments:
                    try:
                        self.turns.put_nowait(
                            (" ".join(fragments), self.generation, time.monotonic())
                        )
                    except asyncio.QueueFull as exc:
                        raise ServiceError(
                            "voice_overloaded", "Too many pending caller turns."
                        ) from exc
                fragments = []
                speaking = False
        raise ServiceError("stt_disconnected", "Transcription connection closed unexpectedly.")

    async def respond(self) -> None:
        while True:
            text, generation, endpoint_at = await self.turns.get()

            async def enqueue(
                sentence: str, turn_generation: int = generation, turn_time: float = endpoint_at
            ) -> None:
                if turn_generation == self.generation:
                    self.sentences.put_nowait((sentence, turn_generation, turn_time))

            try:
                async with asyncio.timeout(self.settings.voice_turn_timeout_seconds):
                    result = await self.brain.respond(
                        ChatRequest(
                            message=text, caller_phone=self.caller_phone, history=self.history
                        ),
                        on_sentence=enqueue,
                    )
                self.history = result.updated_history
            except (ServiceError, TimeoutError) as exc:
                logger.warning(
                    "voice_turn_failed call_sid=%s error_type=%s", self.call_sid, type(exc).__name__
                )
                reply = (
                    "I'm having trouble verifying that. "
                    "Please contact the office to confirm any booking."
                )
                self.history = (
                    self.history
                    + [
                        HistoryMessage(role="user", content=text),
                        HistoryMessage(role="assistant", content=reply),
                    ]
                )[-40:]
                await enqueue(reply)
            # Barge-in only cancels playback; a database operation runs to completion and
            # its result remains in history. Caller turns execute serially, never concurrently.

    async def speak(self) -> None:
        while True:
            text, generation, endpoint_at = await self.sentences.get()
            if generation != self.generation:
                continue
            self.playback = asyncio.create_task(self.play(text, generation, endpoint_at))
            try:
                await self.playback
            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():
                    raise
                # The child was cancelled by caller barge-in; keep the playback worker alive.

    async def play(self, text: str, generation: int, endpoint_at: float | None) -> None:
        first = True
        async with aclosing(self.tts.stream_voice_chunks(text)) as chunks:
            async for chunk in chunks:
                for offset in range(0, len(chunk), 160):
                    if generation != self.generation:
                        return
                    await self.send(
                        {
                            "event": "media",
                            "media": {
                                "payload": base64.b64encode(chunk[offset : offset + 160]).decode(
                                    "ascii"
                                )
                            },
                        }
                    )
                    if first and endpoint_at is not None and self.latency_generation != generation:
                        self.latency_generation = generation
                        latency = (time.monotonic() - endpoint_at) * 1000
                        logger.info(
                            "voice_audio_sent call_sid=%s endpoint_to_audio_ms=%.1f target_met=%s",
                            self.call_sid,
                            latency,
                            latency < 2000,
                        )
                    first = False
        if generation == self.generation:
            self.mark_counter += 1
            mark = f"mia-{self.mark_counter}"
            self.pending_marks.add(mark)
            if len(self.pending_marks) > 100:
                raise ServiceError("playback_stalled", "Twilio did not acknowledge audio playback.")
            await self.send({"event": "mark", "mark": {"name": mark}})

    async def send(self, payload: dict[str, Any]) -> None:
        async with self.sending:
            await self.websocket.send_json({**payload, "streamSid": self.stream_sid})


@router.websocket("/stream")
async def voice_stream(websocket: WebSocket) -> None:
    state = websocket.app.state
    settings: Settings = state.settings
    try:
        # The WebSocket upgrade is an HTTPS GET; validate its canonical public URL.
        if not valid_stream_signature(
            settings,
            websocket.url.path,
            websocket.url.query,
            websocket.headers.get("x-twilio-signature"),
        ):
            await websocket.close(code=1008)
            return
        for provider in (settings.effective_llm_provider, "deepgram", "elevenlabs", "supabase"):
            settings.require(provider)
        if state.active_calls >= settings.max_concurrent_calls:
            await websocket.close(code=1013)
            return
    except ServiceError:
        await websocket.close(code=1013)
        return
    state.active_calls += 1
    try:
        await websocket.accept()
        await VoiceSession(websocket, settings, state.brain, state.stt, state.tts).run()
    except ServiceError as exc:
        logger.warning("voice_session_failed code=%s", exc.code)
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close(code=1008 if exc.status_code < 500 else 1011)
    except TimeoutError:
        logger.info("voice_session_timeout")
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close(code=1000)
    except Exception as exc:
        logger.error("voice_session_failed error_type=%s", type(exc).__name__)
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close(code=1011)
    finally:
        state.active_calls -= 1
        with suppress(RuntimeError, WebSocketDisconnect):
            await websocket.close(code=1000)
