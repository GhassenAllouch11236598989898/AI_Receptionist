"""One lazy async Supabase client per application/worker, with explicit teardown."""

import asyncio
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx
from supabase import AsyncClient, AsyncClientOptions, acreate_client

from config import Settings

logger = logging.getLogger(__name__)


class _InMemoryResult:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _InMemoryQuery:
    def __init__(self, store: list[dict[str, Any]]) -> None:
        self._store = store
        self._filters: list[Callable[[dict[str, Any]], bool]] = []
        self._limit: int | None = None
        self._offset: int = 0
        self._order_by: list[tuple[str, bool]] = []

    def eq(self, column: str, value: Any) -> "_InMemoryQuery":
        self._filters.append(lambda row: str(row.get(column)) == str(value))
        return self

    def limit(self, count: int) -> "_InMemoryQuery":
        self._limit = count
        return self

    def order(self, column: str, desc: bool = False) -> "_InMemoryQuery":
        self._order_by.append((column, desc))
        return self

    def range(self, start: int, end: int) -> "_InMemoryQuery":
        self._offset = start
        self._limit = end - start + 1
        return self

    async def execute(self) -> _InMemoryResult:
        rows = [r for r in self._store if all(f(r) for f in self._filters)]
        for col, desc in reversed(self._order_by):
            rows.sort(key=lambda r: str(r.get(col, "")), reverse=desc)
        if self._offset:
            rows = rows[self._offset :]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _InMemoryResult([dict(r) for r in rows])


class _InMemoryUpsert:
    def __init__(
        self, store: list[dict[str, Any]], values: dict[str, Any], on_conflict: str
    ) -> None:
        self._store = store
        self._values = values
        self._on_conflict = on_conflict

    async def execute(self) -> _InMemoryResult:
        conflict_val = self._values.get(self._on_conflict)
        for row in self._store:
            if conflict_val and row.get(self._on_conflict) == conflict_val:
                row.update(self._values)
                return _InMemoryResult([dict(row)])
        new_row = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            **self._values,
        }
        self._store.append(new_row)
        return _InMemoryResult([dict(new_row)])


class _InMemoryInsert:
    def __init__(self, store: list[dict[str, Any]], values: dict[str, Any]) -> None:
        self._store = store
        self._values = values

    async def execute(self) -> _InMemoryResult:
        new_row = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(UTC).isoformat(),
            **self._values,
        }
        self._store.append(new_row)
        return _InMemoryResult([dict(new_row)])


class InMemoryClient:
    def __init__(self) -> None:
        self.state: dict[str, list[dict[str, Any]]] = {"users": [], "bookings": []}

    def table(self, name: str) -> Any:
        class TableWrapper:
            def __init__(wrapper, tbl_name: str, store: list[dict[str, Any]]) -> None:
                wrapper.name = tbl_name
                wrapper._store = store

            def select(wrapper, cols: str = "*") -> _InMemoryQuery:
                return _InMemoryQuery(wrapper._store)

            def upsert(wrapper, values: dict[str, Any], on_conflict: str = "") -> _InMemoryUpsert:
                return _InMemoryUpsert(wrapper._store, values, on_conflict)

            def insert(wrapper, values: dict[str, Any]) -> _InMemoryInsert:
                return _InMemoryInsert(wrapper._store, values)

        return TableWrapper(name, self.state.setdefault(name, []))


class Database:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: AsyncClient | InMemoryClient | None = None
        self._lock = asyncio.Lock()
        self._http = httpx.AsyncClient(timeout=settings.provider_timeout_seconds)

    async def get_client(self) -> AsyncClient | InMemoryClient:
        if self.settings.app_env == "development" and not (
            self.settings.supabase_url and self.settings.supabase_service_role_key
        ):
            async with self._lock:
                if self._client is None:
                    logger.info("using_in_memory_database (SUPABASE_URL not configured)")
                    self._client = InMemoryClient()
            return self._client
        self.settings.require("supabase")
        async with self._lock:
            if self._client is None:
                assert self.settings.supabase_url and self.settings.supabase_service_role_key
                self._client = await acreate_client(
                    self.settings.supabase_url,
                    self.settings.supabase_service_role_key.get_secret_value(),
                    options=AsyncClientOptions(
                        auto_refresh_token=False,
                        persist_session=False,
                        httpx_client=self._http,
                    ),
                )
        return self._client

    async def close(self) -> None:
        await self._http.aclose()
        self._client = None
