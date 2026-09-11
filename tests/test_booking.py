import asyncio
import json

import httpx
import pytest

from database import Database
from errors import ServiceError
from services.booking import BookingService


@pytest.fixture
async def db(settings):
    database = Database(settings)
    await database.close()
    yield database
    await database.close()


def attach(db, handler):
    db._http = httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_database_conflict_after_both_callers_observe_availability(db, settings):
    lookups = 0
    both_checked = asyncio.Event()
    saved = []

    async def provider(request):
        nonlocal lookups
        if request.method == "GET":
            assert request.url.params["status"] == "eq.confirmed"
            assert request.url.params["booking_time"] == "eq.14:00"
            lookups += 1
            if lookups == 2:
                both_checked.set()
            await asyncio.wait_for(both_checked.wait(), timeout=2)
            return httpx.Response(200, json=[])
        payload = json.loads(request.content)
        if request.url.path.endswith("/users"):
            assert request.url.params["on_conflict"] == "phone_number"
            return httpx.Response(201, json=[{"id": "user-id", **payload}])
        if saved:
            return httpx.Response(
                409,
                json={
                    "code": "23505",
                    "message": 'duplicate key violates constraint "unique_booking_slot"',
                    "details": None,
                    "hint": None,
                },
            )
        saved.append(payload)
        return httpx.Response(201, json=[{"id": "booking-id", **payload}])

    attach(db, provider)
    service = BookingService(db, settings)
    results = await asyncio.gather(
        *[
            service.create_booking(name, phone, "2099-01-01", "14:00")
            for name, phone in [("Alice", "+14165551234"), ("Bob", "+14165551235")]
        ]
    )
    assert sorted(result["status"] for result in results) == ["confirmed", "conflict"]
    assert len(saved) == 1


async def test_confirmed_slot_does_not_upsert_user(db, settings):
    def provider(request):
        assert request.method == "GET"
        return httpx.Response(200, json=[{"id": "existing"}])

    attach(db, provider)
    result = await BookingService(db, settings).create_booking(
        "Mona", "+14165551234", "2099-01-01", "14:00"
    )
    assert result["status"] == "conflict"


async def test_insert_timeout_is_unknown_and_never_retried(db, settings):
    inserts = 0

    def provider(request):
        nonlocal inserts
        if request.method == "GET":
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/users"):
            return httpx.Response(201, json=[{"id": "user-id"}])
        inserts += 1
        raise httpx.ReadTimeout("private provider data", request=request)

    attach(db, provider)
    with pytest.raises(ServiceError, match="uncertain") as error:
        await BookingService(db, settings).create_booking(
            "Mona", "+14165551234", "2099-01-01", "14:00"
        )
    assert error.value.code == "booking_outcome_unknown"
    assert inserts == 1


async def test_list_only_confirmed_with_stable_pagination(db, settings):
    def provider(request):
        assert request.url.params["status"] == "eq.confirmed"
        assert request.url.params["order"] == "created_at.desc,id.desc"
        assert request.url.params["offset"] == "10"
        assert request.url.params["limit"] == "10"
        return httpx.Response(200, json=[{"id": "a"}])

    attach(db, provider)
    assert await BookingService(db, settings).list_recent_bookings(10, 10) == [{"id": "a"}]


async def test_gateway_error_after_insert_is_an_uncertain_outcome(db, settings):
    def provider(request):
        if request.method == "GET":
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/users"):
            return httpx.Response(201, json=[{"id": "user-id"}])
        return httpx.Response(
            504,
            json={
                "code": "504",
                "message": "upstream timed out",
                "details": None,
                "hint": None,
            },
        )

    attach(db, provider)
    with pytest.raises(ServiceError) as error:
        await BookingService(db, settings).create_booking(
            "Mona", "+14165551234", "2099-01-01", "14:00"
        )
    assert error.value.code == "booking_outcome_unknown"


@pytest.mark.parametrize(
    "day,slot",
    [
        ("2020-01-01", "12:00"),
        ("2030-03-10", "02:30"),
        ("2030-11-03", "01:30"),
    ],
)
def test_past_and_dst_slots_are_rejected_before_db_access(settings, day, slot):
    settings.business_timezone = "America/New_York"
    service = BookingService(None, settings)
    with pytest.raises(ServiceError):
        service.validate_slot(day, slot)
