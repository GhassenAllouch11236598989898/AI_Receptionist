-- Run in the Supabase SQL editor as the database owner. Safe to run repeatedly.
-- One business/calendar per deployment; all dates/times use BUSINESS_TIMEZONE.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The UNIQUE constraint already creates a btree index on phone_number.

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_booking_slot
    ON public.bookings (booking_date, booking_time)
    WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_recent_confirmed
    ON public.bookings (created_at DESC, id DESC) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_user_id ON public.bookings (user_id);

-- Only the backend's service_role key may read/write customer data.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users, public.bookings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users, public.bookings TO service_role;
COMMIT;
