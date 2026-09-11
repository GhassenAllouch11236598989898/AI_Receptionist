"""Booking operations; PostgreSQL is the final authority on slot conflicts."""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from postgrest.exceptions import APIError

from config import Settings
from database import Database
from errors import ServiceError
from models import BookingRequest, SlotRequest

logger = logging.getLogger(__name__)


class BookingService:
    def __init__(self, database: Database, settings: Settings) -> None:
        self.database = database
        self.settings = settings

    def validate_slot(self, booking_date: str, booking_time: str) -> SlotRequest:
        slot = SlotRequest(booking_date=booking_date, booking_time=booking_time)
        naive = datetime.fromisoformat(f"{slot.booking_date}T{slot.booking_time}")
        zone = ZoneInfo(self.settings.business_timezone)
        local = naive.replace(tzinfo=zone)
        if local.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != naive:
            raise ServiceError("invalid_slot", "That local time does not exist due to DST.", 422)
        if local.utcoffset() != local.replace(fold=1).utcoffset():
            raise ServiceError("invalid_slot", "That local time is ambiguous due to DST.", 422)
        if local <= datetime.now(zone):
            raise ServiceError("past_slot", "Choose a future appointment date and time.", 422)
        return slot

    async def check_slot_available(self, booking_date: str, booking_time: str) -> bool:
        slot = self.validate_slot(booking_date, booking_time)
        client = await self.database.get_client()
        try:
            response = await (
                client.table("bookings")
                .select("id")
                .eq("booking_date", slot.booking_date)
                .eq("booking_time", slot.booking_time)
                .eq("status", "confirmed")
                .limit(1)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            logger.warning("availability_lookup_failed error_type=%s", type(exc).__name__)
            raise ServiceError(
                "database_unavailable", "Availability could not be checked."
            ) from exc
        return not response.data

    async def create_booking(
        self, name: str, phone: str, booking_date: str, booking_time: str
    ) -> dict[str, Any]:
        booking = BookingRequest(
            name=name, phone=phone, booking_date=booking_date, booking_time=booking_time
        )
        if not await self.check_slot_available(booking.booking_date, booking.booking_time):
            return self._conflict()
        client = await self.database.get_client()
        try:
            user = await (
                client.table("users")
                .upsert(
                    {"name": booking.name, "phone_number": booking.phone},
                    on_conflict="phone_number",
                )
                .execute()
            )
            if not user.data:
                raise ServiceError("database_unavailable", "Customer record could not be saved.")
        except (APIError, httpx.HTTPError) as exc:
            logger.warning("user_upsert_failed error_type=%s", type(exc).__name__)
            raise ServiceError(
                "database_unavailable", "Customer record could not be saved."
            ) from exc

        try:
            saved = await (
                client.table("bookings")
                .insert(
                    {
                        "user_id": user.data[0]["id"],
                        "customer_name": booking.name,
                        "customer_phone": booking.phone,
                        "booking_date": booking.booking_date,
                        "booking_time": booking.booking_time,
                        "status": "confirmed",
                    }
                )
                .execute()
            )
        except asyncio.CancelledError:
            logger.warning("booking_result_unknown reason=request_cancelled")
            raise
        except APIError as exc:
            if exc.code == "23505" and "unique_booking_slot" in exc.message:
                logger.info("booking_slot_conflict")
                return self._conflict()
            logger.warning("booking_insert_failed code=%s", exc.code)
            raise ServiceError(
                "booking_outcome_unknown",
                "The booking could not be confirmed. Check bookings before trying again.",
            ) from exc
        except httpx.HTTPError as exc:
            # The server may have committed before the connection failed. Never retry a write.
            logger.warning("booking_result_unknown error_type=%s", type(exc).__name__)
            raise ServiceError(
                "booking_outcome_unknown",
                "The booking result is uncertain. Check the bookings list before trying again.",
            ) from exc
        if not saved.data:
            raise ServiceError(
                "booking_outcome_unknown",
                "No confirmation returned; verify bookings before retrying.",
            )
        logger.info("booking_confirmed booking_id=%s", saved.data[0]["id"])
        return {"status": "confirmed", "booking": saved.data[0]}

    @staticmethod
    def _conflict() -> dict[str, str]:
        return {
            "status": "conflict",
            "code": "slot_unavailable",
            "message": "That time is already booked. Please choose another time.",
        }

    async def list_recent_bookings(self, limit: int = 10, offset: int = 0) -> list[dict[str, Any]]:
        if not 1 <= limit <= 100 or offset < 0:
            raise ServiceError(
                "invalid_pagination", "Limit must be 1–100 and offset nonnegative.", 422
            )
        client = await self.database.get_client()
        try:
            result = await (
                client.table("bookings")
                .select("*")
                .eq("status", "confirmed")
                .order("created_at", desc=True)
                .order("id", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except (APIError, httpx.HTTPError) as exc:
            logger.warning("booking_list_failed error_type=%s", type(exc).__name__)
            raise ServiceError("database_unavailable", "Bookings could not be retrieved.") from exc
        return result.data
