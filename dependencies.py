"""Small FastAPI dependency boundary for service injection and Swagger authorization."""

import secrets
from typing import Annotated

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

from services.booking import BookingService
from services.brain import BrainService
from services.stt import STTService
from services.tts import TTSService

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(
    request: Request, key: Annotated[str | None, Security(api_key_header)] = None
) -> None:
    configured = request.app.state.settings.api_access_key
    if configured and (
        not key or not secrets.compare_digest(key.encode(), configured.get_secret_value().encode())
    ):
        raise HTTPException(status_code=401, detail="A valid X-API-Key is required.")


def get_bookings(request: Request) -> BookingService:
    return request.app.state.bookings


def get_brain(request: Request) -> BrainService:
    return request.app.state.brain


def get_stt(request: Request) -> STTService:
    return request.app.state.stt


def get_tts(request: Request) -> TTSService:
    return request.app.state.tts
