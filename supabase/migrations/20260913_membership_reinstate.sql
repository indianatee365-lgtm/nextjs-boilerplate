-- Reinstating a lapsed membership.
--
-- Policy (Jerrod, 2026-09-13): Founder's Club never ends, and a former member
-- is free to rejoin once a year at their locked-in price with their original
-- discount, "as if nothing happened."
--
-- memberships.reactivation_count has existed since the original membership
-- migration (20260421) but nothing has ever read or written it, and an integer
-- alone cannot answer "was the last one within 365 days?" - so the once-a-year
-- rule had no way to be enforced. last_reinstated_at is the missing half.
--
-- Both columns are written by reinstateMembership() in lib/membership/reinstate.ts,
-- which updates the member's EXISTING row in place rather than inserting a new
-- one. That is deliberate: founder_number, joining_fee_paid and
-- year_one_discount_expires_at all have to survive, and enforce_founder_cap is
-- BEFORE INSERT only, so an in-place update correctly never consumes a second
-- founder slot. (check_founder_cap() counts founders by joining_fee_paid
-- regardless of status, so a cancelled founder's slot was never freed anyway.)

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS last_reinstated_at timestamptz;

COMMENT ON COLUMN memberships.last_reinstated_at IS
  'When this membership was last reinstated after lapsing. Paired with reactivation_count to enforce the once-per-year rejoin rule.';
