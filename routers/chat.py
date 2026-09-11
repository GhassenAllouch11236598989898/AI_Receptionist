"""Swagger-accessible conversation and booking operations."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from dependencies import get_bookings, get_brain, require_api_key
from models import BookingRequest, ChatRequest, ChatResponse, SlotRequest
from services.booking import BookingService
from services.brain import BrainService

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(
    body: ChatRequest, brain: Annotated[BrainService, Depends(get_brain)]
) -> ChatResponse:
    """Send updated_history back as history on the next turn. No phone call is needed."""
    return await brain.respond(body)


@router.post("/bookings/check-availability", tags=["Bookings"])
async def check_availability(
    body: SlotRequest, bookings: Annotated[BookingService, Depends(get_bookings)]
) -> dict[str, Any]:
    """Test database availability independently of OpenAI."""
    return {
        **body.model_dump(),
        "available": await bookings.check_slot_available(**body.model_dump()),
    }


@router.post(
    "/bookings", tags=["Bookings"], status_code=201, responses={409: {"description": "Slot taken"}}
)
async def create_booking(
    body: BookingRequest, bookings: Annotated[BookingService, Depends(get_bookings)]
) -> JSONResponse:
    """Create a real confirmed booking without a chat or phone call."""
    result = await bookings.create_booking(**body.model_dump())
    return JSONResponse(result, status_code=409 if result["status"] == "conflict" else 201)


@router.get("/bookings", tags=["Bookings"])
async def list_bookings(
    bookings: Annotated[BookingService, Depends(get_bookings)],
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, Any]]:
    """List confirmed bookings, newest first. Increase offset to retrieve further pages."""
    return await bookings.list_recent_bookings(limit, offset)
