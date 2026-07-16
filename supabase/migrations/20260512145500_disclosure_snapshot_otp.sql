-- Add body_snapshot to disclosure_acknowledgments
-- Stores the exact text the user agreed to at time of acknowledgment.
-- Without this, updating disclosure wording destroys the audit trail.
ALTER TABLE disclosure_acknowledgments
  ADD COLUMN IF NOT EXISTS body_snapshot text,
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL;

-- Add phone verification scaffold to profiles
-- phone_verified flips to true once OTP is confirmed (not implemented yet — scaffold only).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
