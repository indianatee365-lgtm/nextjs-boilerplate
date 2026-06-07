-- Migration: add Unifi Access visitor tracking to bookings
-- Run in Supabase SQL editor after bench test passes (target: 2026-07-25)
-- See tee365-vestibule-shopping.md for full context

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS unifi_visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS access_code_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS bookings_unifi_visitor_id_idx
  ON bookings (unifi_visitor_id)
  WHERE unifi_visitor_id IS NOT NULL;

-- After running this migration, update lib/access-control/index.ts call sites
-- to save visitorId: remove 'void visitorId' and add to .update() call
-- in bookings/route.ts, stripe/webhook/route.ts, and booking-reminders/route.ts
