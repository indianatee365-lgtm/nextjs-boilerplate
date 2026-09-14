-- Banning a customer from the facility.
--
-- The Facility Rules disclosure every customer agrees to at booking says an
-- alcohol violation "will result in immediate removal from the facility
-- without refund, and may result in a permanent ban and forfeiture of all
-- membership benefits, including Founder's Club." Until now that promise had
-- no mechanism behind it: nothing in the system could stop a removed customer
-- from booking a bay again the same night, and enforcement was Jerrod
-- recognising a name.
--
-- banned is checked in createBooking(), which is the single chokepoint for
-- both the website flow and the phone agent, so neither channel can bypass it.
-- It also implies the self-service membership restore is off (see
-- lib/membership/reinstate.ts), which is why reinstate_blocked and this are
-- separate columns: a chargeback should stop someone rejoining without
-- barring them from the building, and a ban should do both.
--
-- IMPORTANT: banning does NOT retroactively revoke a door code that has
-- already been issued for an upcoming booking. Those bookings have to be
-- cancelled, which refunds per the normal policy. The admin UI surfaces the
-- count so it cannot be missed.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_reason text,
  ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES profiles(id);

COMMENT ON COLUMN profiles.banned IS
  'Barred from the facility. Blocks new bookings on every channel and the self-service membership restore. Does not revoke already-issued door codes.';
