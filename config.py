"""Validated environment configuration; no API clients are created at import time."""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from errors import ServiceError


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True
    )

    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    business_name: str = Field(default="our office", min_length=1, max_length=120)
    business_timezone: str = "Africa/Lagos"
    public_base_url: str | None = None
    cors_origins: list[str] = Field(default_factory=list)
    api_access_key: SecretStr | None = None

    llm_provider: Literal["auto", "openai", "gemini"] = "auto"
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None

    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.6-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    deepgram_api_key: SecretStr | None = None
    deepgram_model: str = "nova-3"
    deepgram_language: str = "en-US"
    deepgram_endpointing_ms: int = Field(default=300, ge=100, le=1500)
    elevenlabs_api_key: SecretStr | None = None
    elevenlabs_voice_id: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]+$")
    elevenlabs_model: str = "eleven_turbo_v2_5"
    twilio_account_sid: str | None = Field(default=None, pattern=r"^AC[0-9a-fA-F]{32}$")
    twilio_auth_token: SecretStr | None = None
    twilio_validate_signatures: bool = True
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None

    provider_timeout_seconds: float = Field(default=25, ge=1, le=120)
    voice_turn_timeout_seconds: float = Field(default=35, ge=5, le=120)
    max_tool_rounds: int = Field(default=4, ge=1, le=6)
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=25 * 1024 * 1024)
    max_call_seconds: int = Field(default=1800, ge=30, le=7200)
    max_concurrent_calls: int = Field(default=20, ge=1, le=500)

    @field_validator("business_timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Use a valid IANA business timezone") from exc
        return value

    @field_validator("public_base_url", "supabase_url")
    @classmethod
    def valid_origin(cls, value: str | None) -> str | None:
        if value is None:
            return None
        parts = urlsplit(value)
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username
            or parts.password
            or parts.query
            or parts.fragment
            or parts.path not in {"", "/"}
        ):
            raise ValueError("Use an http(s) origin without credentials, path, query, or fragment")
        return value.rstrip("/")

    @model_validator(mode="after")
    def production_requirements(self) -> "Settings":
        if self.app_env == "production":
            missing = sorted(
                {key for keys in self.missing_configuration().values() for key in keys}
            )
            if missing:
                raise ValueError("Production requires: " + ", ".join(missing))
            if not self.api_access_key or len(self.api_access_key.get_secret_value()) < 32:
                raise ValueError("Production requires API_ACCESS_KEY with at least 32 characters")
            if not self.twilio_validate_signatures:
                raise ValueError("Twilio signature validation must stay enabled in production")
            if not self.public_base_url or not self.public_base_url.startswith("https://"):
                raise ValueError("Production requires an HTTPS PUBLIC_BASE_URL")
        return self

    @property
    def effective_llm_provider(self) -> Literal["openai", "gemini"]:
        if self.llm_provider == "gemini":
            return "gemini"
        if self.llm_provider == "openai":
            return "openai"
        if self.gemini_api_key and not self.openai_api_key:
            return "gemini"
        return "openai"

    def missing_configuration(self) -> dict[str, list[str]]:
        llm = self.effective_llm_provider
        groups = {
            llm: ["gemini_api_key"] if llm == "gemini" else ["openai_api_key"],
            "deepgram": ["deepgram_api_key"],
            "elevenlabs": ["elevenlabs_api_key", "elevenlabs_voice_id"],
            "supabase": ["supabase_url", "supabase_service_role_key"],
            "twilio": ["twilio_account_sid", "twilio_auth_token", "public_base_url"],
        }
        return {
            provider: [field.upper() for field in fields if not getattr(self, field)]
            for provider, fields in groups.items()
        }

    def require(self, provider: str) -> None:
        target = provider
        if provider in {"openai", "gemini", "llm"}:
            target = self.effective_llm_provider
        if missing := self.missing_configuration().get(target):
            raise ServiceError(
                "not_configured", f"Configure {', '.join(missing)} to use {target}.", 503
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
