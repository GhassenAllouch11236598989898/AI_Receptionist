"""HTTP inputs and tool arguments share validation rules."""

from datetime import date, time
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+[1-9]\d{7,14}$")]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class SlotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2030-10-12"])
    booking_time: str = Field(pattern=r"^\d{2}:\d{2}$", examples=["14:00"])

    @field_validator("booking_date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value

    @field_validator("booking_time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        time.fromisoformat(value)
        return value


class BookingRequest(SlotRequest):
    name: str = Field(min_length=1, max_length=100)
    phone: Phone

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: Text


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: Text
    caller_phone: Phone | None = None
    history: list[HistoryMessage] = Field(default_factory=list, max_length=40)


class ToolExecution(BaseModel):
    name: str
    arguments: dict[str, Any]
    result: dict[str, Any]


class ChatResponse(BaseModel):
    reply: str
    updated_history: list[HistoryMessage]
    tools_called: list[ToolExecution]


class TTSRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: Text
    output_format: Literal["mp3_44100_128", "ulaw_8000"] = "mp3_44100_128"
