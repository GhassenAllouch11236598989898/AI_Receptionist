import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import AsyncOpenAI

from models import ChatRequest
from services.brain import BrainService


def sse(deltas):
    chunks = [
        {
            "id": "chat-test",
            "object": "chat.completion.chunk",
            "created": 1,
            "model": "gpt-4o-mini",
            "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
        }
        for delta in deltas
    ]
    return "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"


def tool_deltas(name, args, call_id="call_1"):
    encoded = json.dumps(args)
    return [
        {
            "tool_calls": [
                {
                    "index": 0,
                    "id": call_id,
                    "type": "function",
                    "function": {"name": name, "arguments": encoded[:8]},
                }
            ]
        },
        {"tool_calls": [{"index": 0, "function": {"arguments": encoded[8:]}}]},
    ]


def response(deltas):
    return httpx.Response(200, text=sse(deltas), headers={"Content-Type": "text/event-stream"})


async def test_native_tool_loop_and_roundtrip_history(settings):
    requests = []
    args = {
        "name": "Mona",
        "phone": "+14165551234",
        "booking_date": "2099-01-01",
        "booking_time": "14:00",
    }
    saved = {"status": "confirmed", "booking": {"id": "booking-id", **args}}
    bookings = AsyncMock()
    bookings.create_booking.return_value = saved

    def provider(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body["model"] == "gpt-4o-mini"
        assert body["parallel_tool_calls"] is False
        if len(requests) == 1:
            return response(tool_deltas("book_appointment", args))
        assert body["messages"][-1]["role"] == "tool"
        assert body["messages"][-1]["tool_call_id"] == "call_1"
        assert json.loads(body["messages"][-1]["content"]) == saved
        return response([{"content": "You're confirmed. "}, {"content": "See you soon!"}])

    async with AsyncOpenAI(
        api_key="test",
        max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider)),
    ) as client:
        result = await BrainService(settings, bookings, client).respond(
            ChatRequest(message="Book me on January 1, 2099 at 2 pm", caller_phone=args["phone"])
        )
    bookings.create_booking.assert_awaited_once_with(**args)
    assert result.reply == "You're confirmed. See you soon!"
    assert result.tools_called[0].result == saved
    assert len(result.updated_history) == 2
    assert ChatRequest(message="Thanks", history=result.updated_history)


async def test_sentence_callback_and_multilingual_prompt(settings):
    emitted = []

    def provider(request):
        prompt = json.loads(request.content)["messages"][0]["content"]
        assert "Tunisian Arabic" in prompt
        assert settings.business_timezone in prompt
        assert "Never invent weather" in prompt
        return response(
            [
                {"content": "إن شاء الله الجو باهي! "},
                {"content": "تحب نحجزلك موعد؟ "},
                {"content": "Extra third sentence."},
            ]
        )

    async def on_sentence(text):
        emitted.append(text)

    async with AsyncOpenAI(
        api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider))
    ) as client:
        result = await BrainService(settings, AsyncMock(), client).respond(
            ChatRequest(message="كيفاش الطقس؟"), on_sentence=on_sentence
        )
    assert emitted == ["إن شاء الله الجو باهي!", "تحب نحجزلك موعد؟"]
    assert result.reply == " ".join(emitted)


async def test_repeated_tools_are_memoized_and_loop_is_bounded(settings):
    settings.max_tool_rounds = 2
    bookings = AsyncMock()
    bookings.check_slot_available.return_value = True
    calls = 0

    def provider(request):
        nonlocal calls
        calls += 1
        if calls <= 2:
            return response(
                tool_deltas(
                    "check_availability",
                    {"booking_date": "2099-01-01", "booking_time": "14:00"},
                    f"call_{calls}",
                )
            )
        assert json.loads(request.content)["tool_choice"] == "none"
        return response([{"content": "That time is available."}])

    async with AsyncOpenAI(
        api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider))
    ) as client:
        result = await BrainService(settings, bookings, client).respond(
            ChatRequest(message="Is 2 free?")
        )
    bookings.check_slot_available.assert_awaited_once()
    assert calls == 3
    assert len(result.tools_called) == 2


@pytest.mark.parametrize(
    "raw", ["{bad", "[]", '{"booking_date":"2099-02-30","booking_time":"99:00"}']
)
async def test_invalid_tool_arguments_do_not_reach_database(settings, raw):
    bookings = AsyncMock()
    result, _ = await BrainService(settings, bookings)._execute_tool("check_availability", raw, {})
    assert result["code"] == "invalid_arguments"
    bookings.check_slot_available.assert_not_called()


async def test_confirmation_survives_followup_openai_failure(settings):
    bookings = AsyncMock()
    bookings.create_booking.return_value = {
        "status": "confirmed",
        "booking": {"booking_date": "2099-01-01", "booking_time": "14:00:00"},
    }
    count = 0

    def provider(request):
        nonlocal count
        count += 1
        if count == 1:
            return response(
                tool_deltas(
                    "book_appointment",
                    {
                        "name": "Mona",
                        "phone": "+14165551234",
                        "booking_date": "2099-01-01",
                        "booking_time": "14:00",
                    },
                )
            )
        return httpx.Response(503, json={"error": {"message": "private", "type": "server_error"}})

    async with AsyncOpenAI(
        api_key="test",
        max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider)),
    ) as client:
        result = await BrainService(settings, bookings, client).respond(
            ChatRequest(message="Book it")
        )
    assert "confirmed" in result.reply
    assert "2099-01-01" in result.reply
    assert "private" not in result.reply


async def test_first_sentence_emits_before_completion_finishes(settings):
    first_sentence = asyncio.Event()

    class Upstream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield sse([{"content": "Hello! "}]).replace("data: [DONE]\n\n", "").encode()
            await asyncio.wait_for(first_sentence.wait(), 1)
            yield sse([{"content": "When would you like an appointment?"}]).encode()

    async def spoken(text):
        if text == "Hello!":
            first_sentence.set()

    def provider(request):
        return httpx.Response(200, stream=Upstream(), headers={"content-type": "text/event-stream"})

    async with AsyncOpenAI(
        api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider))
    ) as client:
        result = await BrainService(settings, AsyncMock(), client).respond(
            ChatRequest(message="Hello"), on_sentence=spoken
        )
    assert result.reply == "Hello! When would you like an appointment?"


async def test_booking_invalidates_previous_availability(settings):
    bookings = AsyncMock()
    bookings.check_slot_available.side_effect = [True, False]
    bookings.create_booking.return_value = {"status": "confirmed", "booking": {"id": "saved"}}
    service = BrainService(settings, bookings)
    memo = {}
    slot = {"booking_date": "2099-01-01", "booking_time": "14:00"}
    first, _ = await service._execute_tool("check_availability", json.dumps(slot), memo)
    assert first["available"]
    await service._execute_tool(
        "book_appointment",
        json.dumps(
            {
                **slot,
                "name": "Mona",
                "phone": "+14165551234",
            }
        ),
        memo,
    )
    second, _ = await service._execute_tool("check_availability", json.dumps(slot), memo)
    assert not second["available"]
    assert bookings.check_slot_available.await_count == 2


async def test_gemini_provider_uses_gemini_model_and_tokens(settings):
    from pydantic import SecretStr

    settings.llm_provider = "gemini"
    settings.gemini_api_key = SecretStr("test-gemini")
    settings.openai_api_key = None
    assert settings.effective_llm_provider == "gemini"

    requests = []

    def provider(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body["model"] == "gemini-3.6-flash"
        assert body["max_tokens"] == 250
        assert "parallel_tool_calls" not in body
        return response([{"content": "Hello from Gemini!"}])

    async with AsyncOpenAI(
        api_key="test-gemini",
        base_url=settings.gemini_base_url,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(provider)),
    ) as client:
        result = await BrainService(settings, AsyncMock(), client).respond(
            ChatRequest(message="Hi")
        )
    assert result.reply == "Hello from Gemini!"
    assert len(requests) == 1

