"""HTTP audio tests: no Twilio connection or microphone required."""

import logging
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from dependencies import get_stt, get_tts, require_api_key
from errors import ServiceError
from models import TTSRequest
from services.stt import STTService
from services.tts import TTSService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["Voice tests"], dependencies=[Depends(require_api_key)])


@router.post(
    "/tts-test",
    response_class=StreamingResponse,
    responses={200: {"content": {"audio/mpeg": {}, "audio/x-mulaw": {}}}},
)
async def tts_test(
    body: TTSRequest, tts: Annotated[TTSService, Depends(get_tts)]
) -> StreamingResponse:
    """MP3 is browser playable; ulaw_8000 is raw telephony audio for download/inspection."""
    chunks = tts.stream_voice_chunks(body.text, body.output_format)
    # Start the provider request before committing HTTP 200 so errors are real JSON 503s.
    first = await anext(chunks)

    async def audio_stream():
        async with aclosing(chunks):
            yield first
            try:
                async for chunk in chunks:
                    yield chunk
            except ServiceError:
                logger.warning("tts_http_stream_interrupted")
                # Headers are already sent; terminate this stream without a false JSON payload.
                raise

    mp3 = body.output_format == "mp3_44100_128"
    return StreamingResponse(
        audio_stream(),
        media_type="audio/mpeg" if mp3 else "audio/x-mulaw",
        headers={
            "Content-Disposition": f'inline; filename="mia.{"mp3" if mp3 else "ulaw"}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/stt-test")
async def stt_test(
    request: Request,
    stt: Annotated[STTService, Depends(get_stt)],
    file: Annotated[UploadFile, File(description="A WAV or MP3 file, at most 10 MiB by default")],
) -> dict:
    """Transcribe uploaded audio using the same Deepgram model/language as phone calls."""
    try:
        audio = await file.read(request.app.state.settings.max_upload_bytes + 1)
    finally:
        await file.close()
    if len(audio) > request.app.state.settings.max_upload_bytes:
        raise HTTPException(413, "Audio exceeds MAX_UPLOAD_BYTES.")
    if not audio:
        raise HTTPException(422, "Audio file is empty.")
    # Inspect file signatures instead of trusting the user-supplied filename or MIME type.
    if audio[:4] == b"RIFF" and audio[8:12] == b"WAVE":
        content_type = "audio/wav"
    elif audio[:3] == b"ID3" or (len(audio) >= 2 and audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0):
        content_type = "audio/mpeg"
    else:
        raise HTTPException(415, "Upload a WAV or MP3 audio file.")
    return await stt.transcribe_file(audio, content_type)
