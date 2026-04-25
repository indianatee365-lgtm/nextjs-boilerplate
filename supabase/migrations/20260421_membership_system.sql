-- =============================================================================
-- Tee365 Membership System
-- Run this entire file in the Supabase SQL editor.
-- Safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. membership_plans — add new columns, then upsert all three tiers
-- -----------------------------------------------------------------------------

-- Add only the columns that don't already exist
-- (price_monthly, active, max_members, discount_percent,
--  advance_booking_days, first_year_discount already exist)
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS display_name            text,
  ADD COLUMN IF NOT EXISTS joining_fee             numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_price            numeric,
  ADD COLUMN IF NOT EXISTS discount_floor          numeric,
  ADD COLUMN IF NOT EXISTS max_active_reservations integer;

-- Ensure slug has a unique constraint so ON CONFLICT works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'membership_plans_slug_key'
  ) THEN
    ALTER TABLE membership_plans ADD CONSTRAINT membership_plans_slug_key UNIQUE (slug);
  END IF;
END $$;

INSERT INTO membership_plans (
  slug, name, display_name, price_monthly, joining_fee, annual_price,
  discount_percent, first_year_discount, discount_floor,
  advance_booking_days, max_active_reservations, active, max_members
) VALUES
  ('birdie',  'birdie',  'Birdie',          10.00,  0.00,   89.00, 10, null, null,  10, 2, true, null),
  ('eagle',   'eagle',   'Eagle',           39.00,  0.00,  349.00, 20, null, null,  14, 3, true, null),
  ('founder', 'founder', 'Founder''s Club', 29.00, 199.00,   null, 20,   30, 20.00, 21, 3, true,  100)
ON CONFLICT (slug) DO UPDATE SET
  name                     = EXCLUDED.name,
  display_name             = EXCLUDED.display_name,
  price_monthly            = EXCLUDED.price_monthly,
  joining_fee              = EXCLUDED.joining_fee,
  annual_price             = EXCLUDED.annual_price,
  discount_percent         = EXCLUDED.discount_percent,
  first_year_discount      = EXCLUDED.first_year_discount,
  discount_floor           = EXCLUDED.discount_floor,
  advance_booking_days     = EXCLUDED.advance_booking_days,
  max_active_reservations  = EXCLUDED.max_active_reservations,
  active                   = EXCLUDED.active,
  max_members              = EXCLUDED.max_members;


-- -----------------------------------------------------------------------------
-- 2. memberships — add new columns
-- -----------------------------------------------------------------------------

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS plan_type                    text NOT NULL DEFAULT 'birdie',
  ADD COLUMN IF NOT EXISTS is_annual                   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS annual_start_date           date,
  ADD COLUMN IF NOT EXISTS annual_end_date             date,
  ADD COLUMN IF NOT EXISTS joining_fee_paid            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS joining_fee_paid_at         timestamptz,
  ADD COLUMN IF NOT EXISTS founder_number              integer,
  ADD COLUMN IF NOT EXISTS founder_status_active       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS signup_bonus_hours          numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS year_one_discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_count          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS membership_paused           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_start_date            date,
  ADD COLUMN IF NOT EXISTS pause_end_date              date,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at   timestamptz;
  -- status column already exists; valid values: 'active', 'paused', 'cancelled', 'pending_opening'

-- Ensure founder_number is unique (no two founders share a number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'memberships_founder_number_key'
  ) THEN
    ALTER TABLE memberships
      ADD CONSTRAINT memberships_founder_number_key UNIQUE (founder_number);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3. Founder number assignment — sequential, race-condition safe
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assign_founder_number(member_id uuid)
RETURNS integer AS $$
DECLARE
  next_number integer;
BEGIN
  -- Lock the table to prevent concurrent assignments
  PERFORM pg_advisory_xact_lock(hashtext('assign_founder_number'));

  SELECT COALESCE(MAX(founder_number), 0) + 1
  INTO next_number
  FROM memberships
  WHERE plan_type = 'founder'
    AND founder_number IS NOT NULL;

  IF next_number > 100 THEN
    RAISE EXCEPTION 'Founder cap reached. No numbers available.';
  END IF;

  UPDATE memberships
  SET founder_number = next_number
  WHERE id = member_id;

  RETURN next_number;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 4. Founder cap enforcement trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_founder_cap()
RETURNS trigger AS $$
DECLARE
  current_count integer;
BEGIN
  IF NEW.plan_type = 'founder' THEN
    SELECT COUNT(*) INTO current_count
    FROM memberships
    WHERE plan_type = 'founder'
      AND joining_fee_paid = true;

    IF current_count >= 100 THEN
      RAISE EXCEPTION 'Founder membership cap of 100 has been reached.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_founder_cap ON memberships;
CREATE TRIGGER enforce_founder_cap
  BEFORE INSERT ON memberships
  FOR EACH ROW EXECUTE FUNCTION check_founder_cap();


-- -----------------------------------------------------------------------------
-- 5. member_effective_pricing view
--    Returns the correct hourly rate for every active member × pricing rule.
--    Joins on slug (our codebase uses slug, not name).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW member_effective_pricing AS
SELECT
  pr.id                    AS pricing_rule_id,
  pr.season_type,
  pr.day_type,
  pr.time_type,
  pr.price_per_hour        AS rack_rate,
  m.id                     AS membership_id,
  m.user_id,
  m.plan_type,
  CASE
    WHEN m.plan_type = 'founder'
      AND NOW() < m.year_one_discount_expires_at
    THEN GREATEST(pr.price_per_hour * 0.70, 20.00)   -- 30% off, floor $20
    WHEN m.plan_type = 'founder'
    THEN GREATEST(pr.price_per_hour * 0.80, 20.00)   -- 20% off, floor $20
    WHEN m.plan_type = 'eagle'
    THEN pr.price_per_hour * 0.80                    -- 20% off
    WHEN m.plan_type = 'birdie'
    THEN pr.price_per_hour * 0.90                    -- 10% off
    ELSE pr.price_per_hour
  END AS effective_rate
FROM pricing_rules pr
CROSS JOIN memberships m
WHERE m.status = 'active';


-- -----------------------------------------------------------------------------
-- 6. bookings — add member rate tracking columns
-- -----------------------------------------------------------------------------

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS member_rate_applied       numeric,
  ADD COLUMN IF NOT EXISTS discount_percent_applied  numeric,
  ADD COLUMN IF NOT EXISTS signup_bonus_applied      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_type                 text;
  -- rate_type values: 'rack', 'birdie_discount', 'eagle_discount',
  --                   'founder_standard', 'founder_year_one', 'signup_bonus'


-- -----------------------------------------------------------------------------
-- 7. Booking window validation
--    Takes user_id, returns true if the requested start time is within
--    the member's allowed advance booking window.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_booking_window(
  p_user_id uuid,
  booking_start timestamptz
)
RETURNS boolean AS $$
DECLARE
  allowed_days integer;
  days_ahead   numeric;
BEGIN
  SELECT mp.advance_booking_days INTO allowed_days
  FROM memberships m
  JOIN membership_plans mp ON mp.slug = m.plan_type
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
  LIMIT 1;

  IF allowed_days IS NULL THEN
    allowed_days := 7;  -- non-member / walk-in default
  END IF;

  days_ahead := EXTRACT(EPOCH FROM (booking_start - NOW())) / 86400;

  RETURN days_ahead <= allowed_days;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 8. Active reservation cap enforcement
--    Takes user_id, returns true if they are under their cap.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_reservation_cap(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  current_active integer;
  allowed_max    integer;
BEGIN
  SELECT mp.max_active_reservations INTO allowed_max
  FROM memberships m
  JOIN membership_plans mp ON mp.slug = m.plan_type
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
  LIMIT 1;

  IF allowed_max IS NULL THEN
    allowed_max := 99;  -- non-members have no enforced cap
  END IF;

  SELECT COUNT(*) INTO current_active
  FROM bookings
  WHERE user_id = p_user_id
    AND status IN ('confirmed', 'pending')
    AND starts_at > NOW();

  RETURN current_active < allowed_max;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 9. Pre-opening: flip pending_opening memberships to active on Sept 1, 2026
--    Run this manually on September 1, 2026, or wire it to a pg_cron job.
--
--    pg_cron job (schedule in Supabase dashboard):
--    SELECT cron.schedule(
--      'activate-pending-memberships',
--      '0 4 1 9 2026',   -- 4:00 AM UTC = midnight ET on Sept 1
--      $$ UPDATE memberships SET status = 'active' WHERE status = 'pending_opening' $$
--    );
-- -----------------------------------------------------------------------------

-- Uncomment and run on Sept 1, 2026 if not using pg_cron:
-- UPDATE memberships SET status = 'active' WHERE status = 'pending_opening';
