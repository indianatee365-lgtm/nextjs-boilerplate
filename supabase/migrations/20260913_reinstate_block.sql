-- Gate for self-service membership reinstatement.
--
-- Restoring a lapsed membership is self-serve (the cancel dialog has always
-- promised founders "you can reactivate any time at your original Founder's
-- terms"), so the member does not need an admin to let them back in. But two
-- people must not be able to let themselves back in:
--
--   1. Anyone removed under the zero-tolerance alcohol policy, which the
--      facility disclosures say forfeits all membership benefits including
--      Founder's Club. There is no general ban mechanism in this system yet,
--      so without this flag a removed member could click their way back to
--      active.
--   2. Anyone who charged back the membership payment.
--
-- Defaults to false, so this changes nothing for an ordinary member. Only the
-- self-serve path consults it: an admin reinstating from /admin/users/[id]
-- deliberately bypasses it, because the admin IS the override.
--
-- This is narrow on purpose. A real ban (one that also blocks booking a bay)
-- is a bigger feature and is not what this column does.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reinstate_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reinstate_blocked_reason text;

COMMENT ON COLUMN profiles.reinstate_blocked IS
  'Blocks the self-service membership restore on /account. Does not block booking. Admin reinstatement bypasses it.';
