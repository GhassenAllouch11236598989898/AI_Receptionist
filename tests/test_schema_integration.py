"""Opt-in real PostgreSQL checks against a disposable database, never the SaaS database."""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import psycopg
import pytest

pytestmark = pytest.mark.integration


def test_schema_reapply_and_concurrent_unique_slot():
    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")
    # This test creates an isolated schema but uses the actual supplied schema.sql statements.
    # Supabase roles must exist; on plain PostgreSQL create anon/authenticated/service_role first.
    import uuid

    schema = "mia_test_" + uuid.uuid4().hex
    sql = (Path(__file__).parents[1] / "schema.sql").read_text(encoding="utf-8")
    sql = sql.replace("public.", schema + ".")
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(psycopg.sql.SQL("CREATE SCHEMA {}").format(psycopg.sql.Identifier(schema)))
        try:
            admin.execute(sql)
            admin.execute(sql)  # The schema must be idempotent.
            barrier = Barrier(2)

            def reserve(name):
                with psycopg.connect(dsn, autocommit=True) as connection:
                    barrier.wait(timeout=5)
                    try:
                        connection.execute(
                            psycopg.sql.SQL(
                                "INSERT INTO {}.bookings "
                                "(customer_name, customer_phone, booking_date, booking_time) "
                                "VALUES (%s, %s, %s, %s)"
                            ).format(psycopg.sql.Identifier(schema)),
                            (name, "+14165551234", "2099-01-01", "14:00"),
                        )
                        return "confirmed"
                    except psycopg.errors.UniqueViolation as exc:
                        assert exc.diag.constraint_name == "unique_booking_slot"
                        return "conflict"

            with ThreadPoolExecutor(max_workers=2) as executor:
                assert sorted(executor.map(reserve, ["Mona", "Sara"])) == ["confirmed", "conflict"]
            # Cancelled rows do not block a new reservation for the same slot.
            admin.execute(
                psycopg.sql.SQL("UPDATE {}.bookings SET status = 'cancelled'").format(
                    psycopg.sql.Identifier(schema)
                )
            )
            admin.execute(
                psycopg.sql.SQL(
                    "INSERT INTO {}.bookings "
                    "(customer_name, customer_phone, booking_date, booking_time) "
                    "VALUES ('Mia', '+14165551234', '2099-01-01', '14:00')"
                ).format(psycopg.sql.Identifier(schema))
            )
        finally:
            admin.execute(
                psycopg.sql.SQL("DROP SCHEMA {} CASCADE").format(psycopg.sql.Identifier(schema))
            )
