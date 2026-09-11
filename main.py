"""FastAPI application factory and application-owned provider connection pools."""

import logging
from contextlib import AsyncExitStack, asynccontextmanager

import httpx
from deepgram import AsyncDeepgramClient
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI

from config import Settings, get_settings
from database import Database
from errors import ServiceError
from middleware import RequestSizeLimitMiddleware
from routers import chat, test_voice, voice
from services.booking import BookingService
from services.brain import BrainService
from services.stt import STTService
from services.tts import TTSService

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(
            level=settings.log_level,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        # SDK debug logs can contain complete prompts or provider request details.
        for name in ("httpx", "httpcore", "openai", "deepgram", "websockets"):
            logging.getLogger(name).setLevel(logging.WARNING)
        async with AsyncExitStack() as stack:
            http = await stack.enter_async_context(
                httpx.AsyncClient(
                    timeout=httpx.Timeout(settings.provider_timeout_seconds, connect=5),
                    limits=httpx.Limits(max_connections=100, max_keepalive_connections=30),
                )
            )
            database = Database(settings)
            stack.push_async_callback(database.close)
            openai = None
            if settings.effective_llm_provider == "gemini" and settings.gemini_api_key:
                openai = AsyncOpenAI(
                    api_key=settings.gemini_api_key.get_secret_value(),
                    base_url=settings.gemini_base_url,
                    timeout=settings.provider_timeout_seconds,
                    max_retries=0,
                )
                stack.push_async_callback(openai.close)
            elif settings.openai_api_key:
                openai = AsyncOpenAI(
                    api_key=settings.openai_api_key.get_secret_value(),
                    base_url=settings.openai_base_url,
                    timeout=settings.provider_timeout_seconds,
                    max_retries=0,
                )
                stack.push_async_callback(openai.close)
            deepgram = None
            if settings.deepgram_api_key:
                deepgram = AsyncDeepgramClient(
                    api_key=settings.deepgram_api_key.get_secret_value(),
                    httpx_client=http,
                )
            app.state.bookings = BookingService(database, settings)
            app.state.brain = BrainService(settings, app.state.bookings, openai)
            app.state.stt = STTService(settings, deepgram)
            app.state.tts = TTSService(settings, http)
            logger.info("application_started environment=%s", settings.app_env)
            yield
            logger.info("application_stopped")

    app = FastAPI(
        title="Mia · AI Receptionist",
        version="0.1.0",
        description=(
            "Chat, create appointments, and test voice integrations without a phone call. "
            "Dates and times use BUSINESS_TIMEZONE. Use Authorize if API_ACCESS_KEY is set."
        ),
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.active_calls = 0
    app.add_middleware(RequestSizeLimitMiddleware, max_upload_bytes=settings.max_upload_bytes)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", "X-API-Key"],
        )

    @app.exception_handler(ServiceError)
    async def service_error_handler(request: Request, exc: ServiceError) -> JSONResponse:
        logger.warning("request_failed path=%s code=%s", request.url.path, exc.code)
        return JSONResponse(exc.as_dict(), status_code=exc.status_code)

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        """Liveness and config presence only; no paid calls or credential validity checks."""
        missing = settings.missing_configuration()
        return {
            "status": "ok" if not any(missing.values()) else "degraded",
            "environment": settings.app_env,
            "business_timezone": settings.business_timezone,
            "services": {
                provider: {"configured": not fields, "missing": fields}
                for provider, fields in missing.items()
            },
            "live_provider_checks": False,
        }

    app.include_router(chat.router)
    app.include_router(test_voice.router)
    app.include_router(voice.router)
    return app


app = create_app()
