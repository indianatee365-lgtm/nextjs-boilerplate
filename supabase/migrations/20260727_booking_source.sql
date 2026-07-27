-- Tracks whether a booking was created through the website or by the phone
-- agent on the caller's behalf, so it's visible in admin reporting.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
