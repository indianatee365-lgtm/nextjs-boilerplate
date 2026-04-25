# Tee365 Website & Database Implementation Guide
**Membership System Build Requirements**
*Last Updated: April 2026*

---

## Overview

This document outlines every change needed to the Tee365 website and Supabase database to support the Birdie, Eagle, and Founder's Club membership programs as designed. Work through this in order. Database schema first, then booking logic, then website.

---

## Section 1: Database Changes (Supabase)

### 1.1 membership_plans Table

Verify or update the `membership_plans` table to include all three tiers with correct values.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| name | text | 'birdie', 'eagle', 'founder' |
| display_name | text | 'Birdie', 'Eagle', 'Founder\'s Club' |
| monthly_fee | numeric | 10.00, 39.00, 29.00 |
| joining_fee | numeric | 0, 0, 199.00 |
| annual_price | numeric | 89.00, 349.00, null (founders have no annual) |
| discount_percent | numeric | 10, 20, 20 |
| discount_floor | numeric | null, null, 20.00 (founder floor only) |
| booking_window_days | integer | 10, 14, 21 (non-members default to 7 in application logic) |
| max_active_reservations | integer | 2, 3, 3 |
| is_available | boolean | true/true/false after cap hit |
| max_members | integer | null, null, 100 |
| created_at | timestamptz | auto |

### 1.2 memberships Table

Verify or update `memberships` to support all required fields.

**Add columns if missing:**

```sql
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'birdie',
  ADD COLUMN IF NOT EXISTS is_annual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS annual_start_date date,
  ADD COLUMN IF NOT EXISTS annual_end_date date,
  ADD COLUMN IF NOT EXISTS joining_fee_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS joining_fee_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS founder_number integer,
  ADD COLUMN IF NOT EXISTS founder_status_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS signup_bonus_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_expires_at timestamptz,
  -- For Founders: bonus hours are redeemed at the Founders Preview Event (pre-opening soft launch).
  -- signup_bonus_expires_at should be set to the Preview Event date once scheduled.
  -- For Eagle: signup bonus expires 90 days after signup date.
  ADD COLUMN IF NOT EXISTS year_one_discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivation_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS membership_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_start_date date,
  ADD COLUMN IF NOT EXISTS pause_end_date date,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
  -- status values: 'active', 'paused', 'cancelled', 'pending_opening'
```

### 1.3 Founder Number Assignment

Founder numbers must be assigned sequentially and permanently at the time of joining fee payment, not at signup. Use a database function to handle race conditions so no two founders get the same number.

```sql
CREATE OR REPLACE FUNCTION assign_founder_number(member_id uuid)
RETURNS integer AS $$
DECLARE
  next_number integer;
BEGIN
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
```

### 1.4 Founder Cap Enforcement

Add a check before any new Founder membership is created.

```sql
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

CREATE TRIGGER enforce_founder_cap
BEFORE INSERT ON memberships
FOR EACH ROW EXECUTE FUNCTION check_founder_cap();
```

### 1.5 pricing_rules Table Updates

Your existing `pricing_rules` table handles bay pricing. The discount system needs to read from this table and apply member discounts correctly at booking time.

Add a view that returns the effective price for a member:

```sql
CREATE OR REPLACE VIEW member_effective_pricing AS
SELECT
  pr.id,
  pr.day_type,
  pr.time_type,
  pr.price_per_hour AS rack_rate,
  m.id AS member_id,
  m.plan_type,
  CASE
    WHEN m.plan_type = 'founder'
      AND NOW() < m.year_one_discount_expires_at
    THEN GREATEST(pr.price_per_hour * 0.70, 20.00)
    WHEN m.plan_type = 'founder'
    THEN GREATEST(pr.price_per_hour * 0.80, 20.00)
    WHEN m.plan_type = 'eagle'
    THEN pr.price_per_hour * 0.80
    WHEN m.plan_type = 'birdie'
    THEN pr.price_per_hour * 0.90
    ELSE pr.price_per_hour
  END AS effective_rate
FROM pricing_rules pr
CROSS JOIN memberships m
WHERE m.status = 'active';
```

### 1.6 Bookings Table Updates

Add columns to support member booking rules.

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS member_rate_applied numeric,
  ADD COLUMN IF NOT EXISTS discount_percent_applied numeric,
  ADD COLUMN IF NOT EXISTS signup_bonus_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_type text;
  -- rate_type values: 'rack', 'birdie_discount', 'eagle_discount',
  --                   'founder_standard', 'founder_year_one', 'signup_bonus'
```

### 1.7 Booking Window Enforcement

Add a function that validates booking lead time against member tier.

```sql
CREATE OR REPLACE FUNCTION validate_booking_window(
  member_id uuid,
  booking_start timestamptz
)
RETURNS boolean AS $$
DECLARE
  allowed_days integer;
  days_ahead numeric;
BEGIN
  SELECT mp.booking_window_days INTO allowed_days
  FROM memberships m
  JOIN membership_plans mp ON mp.name = m.plan_type
  WHERE m.id = member_id AND m.status = 'active';

  IF allowed_days IS NULL THEN
    allowed_days := 7; -- walk-in / non-member: 7 days out
  END IF;

  days_ahead := EXTRACT(EPOCH FROM (booking_start - NOW())) / 86400;

  RETURN days_ahead <= allowed_days;
END;
$$ LANGUAGE plpgsql;
```

### 1.8 Active Reservation Cap Enforcement

```sql
CREATE OR REPLACE FUNCTION check_reservation_cap(member_id uuid)
RETURNS boolean AS $$
DECLARE
  current_active integer;
  allowed_max integer;
BEGIN
  SELECT mp.max_active_reservations INTO allowed_max
  FROM memberships m
  JOIN membership_plans mp ON mp.name = m.plan_type
  WHERE m.id = member_id AND m.status = 'active';

  SELECT COUNT(*) INTO current_active
  FROM bookings
  WHERE profile_id = member_id
    AND status IN ('confirmed', 'pending')
    AND start_time > NOW();

  RETURN current_active < allowed_max;
END;
$$ LANGUAGE plpgsql;
```

### 1.9 Annual Membership Date Logic

For all pre-launch annual purchases, the annual period must start September 1, 2026 regardless of purchase date.

```sql
-- When creating an annual membership record pre-launch:
INSERT INTO memberships (
  plan_type,
  is_annual,
  annual_start_date,
  annual_end_date,
  status,
  ...
) VALUES (
  'birdie', -- or 'eagle'
  true,
  '2026-09-01',
  '2027-08-31',
  'pending_opening', -- flip to 'active' on September 1
  ...
);
```

Add a scheduled job or trigger to flip `pending_opening` memberships to `active` on September 1, 2026.

---

## Section 2: Website Changes

### 2.1 Membership Landing Page

Create a dedicated `/membership` or `/join` page with all three tiers displayed side by side. Required elements:

- Tier comparison table matching the members.md document
- Founder's Club sold count display (pulls live from database: `SELECT COUNT(*) FROM memberships WHERE plan_type = 'founder' AND joining_fee_paid = true`)
- "X of 100 Founder memberships remaining" displayed prominently
- When founder count hits 85, update messaging to "Only X spots remaining"
- When founder count hits 100, Founder's Club section replaced with "Sold Out" notice and waitlist signup
- Founder sales also close automatically on August 18, 2026 regardless of spots remaining. Add a site config value `founder_sales_close_at = '2026-08-18T00:00:00'` and check it on the signup flow. After that date, show the same "Sold Out" notice with messaging: "Founder's Club sales have closed ahead of our September 1 opening. Join Birdie or Eagle to become a member."

### 2.2 Membership Signup Flow

**Birdie and Eagle monthly:**
1. Select tier
2. Create account or login
3. Enter payment method (recurring monthly)
4. Confirm benefits
5. Receive confirmation email with member details

**Annual Season Pass:**
1. Select tier and annual option
2. Create account or login
3. Enter payment method (one-time annual charge)
4. Confirm annual period (September 1, 2026 through August 31, 2027)
5. Receive confirmation email noting when benefits activate

**Founder's Club:**
1. Select Founder's Club
2. Create account or login
3. Enter payment for $199 joining fee (one-time)
4. Set up $29/mo recurring
5. Founder number assigned immediately on joining fee payment
6. Receive confirmation email with member number, Founders Wall acknowledgment, and access to private update channel
7. Status set to `pending_opening` until September 1, 2026

### 2.3 Member Dashboard Updates

Add a member dashboard section at `/account` or `/dashboard` with:

- Current tier and member number (for founders)
- Active discount percentage
- Current discount (year-one vs standard) with expiration date for founders
- Booking window length
- Active reservations (count vs cap)
- Signup bonus hours remaining and expiration (Eagle and Founder)
- Membership status (active, paused, pending opening)
- Annual plan end date (if applicable)
- Pause membership option (annual plans only, once per year, up to 90 days)
- Cancel membership option with policy reminder

### 2.4 Booking System Integration

When a member initiates a booking, the system must:

1. Identify their membership tier and status
2. Validate booking lead time against their window (7, 10, or 14 days)
3. Validate active reservation count against their cap (2 or 3)
4. Apply correct discount to displayed pricing before confirmation
5. Check signup bonus hours balance and offer to apply if available
6. Record rate type in booking record for reporting

Non-members and walk-ins see rack rate and can book up to 7 days in advance.

### 2.5 Founder Private Update Channel

Create a simple password-protected page at `/founders` accessible only to confirmed Founder members. Content: construction updates, photos, news, milestone announcements. This does not need to be complex. A simple authenticated page with chronological posts is sufficient. Access controlled by founder_number IS NOT NULL AND joining_fee_paid = true.

### 2.6 Pre-Opening Booking Calendar Access

On September 1, 2026 at 12:00am, the booking calendar opens to Founders only for 48 hours. Eagle and Birdie members get access at 12:00am September 3. General public gets access at 12:00am September 4 or on the day of opening, whichever applies.

Implement with a `booking_open_at` timestamp per tier in membership_plans or as a site configuration value.

### 2.7 Founder Cap Notifications

Set up automated internal alerts:
- Alert at 50 founders sold
- Alert at 75 founders sold
- Alert at 85 founders sold (trigger "Only X remaining" messaging update)
- Alert at 95 founders sold (prepare sold-out assets)
- Alert at 100 founders sold (flip page to sold-out, activate waitlist)

---

## Section 3: Payment Processing

### 3.1 What Needs to Be Handled

- One-time joining fee ($199 for Founder)
- Recurring monthly ($10, $29, or $39/mo)
- One-time annual charge ($89 or $349)
- Proration calculations for mid-cycle cancellations
- Processing fee deduction on refunds ($25 after 30-day window on annual)

### 3.2 Refund Logic

Build refund calculation into the admin panel or document as a manual process:

```
Annual refund amount =
  (annual_price / 12) * months_remaining - $25 processing fee

Months remaining = CEIL((annual_end_date - cancellation_date) / 30)

No refund if months_remaining <= 3 (i.e., after month 9 of 12)
```

---

## Section 4: Reporting Needs

Add admin views for:

- Total members by tier
- Founder count with numbers assigned
- Monthly recurring revenue by tier
- Annual prepay revenue collected
- Signup bonus hours outstanding (liability)
- Membership churn by tier (monthly)
- Bookings by member tier vs walk-in (to track tier utilization)

---

## Section 5: Pre-Launch Checklist

Before selling any memberships:

- [ ] membership_plans table populated with all three tiers
- [ ] Founder cap trigger deployed and tested
- [ ] Founder number assignment function tested (including race condition)
- [ ] Booking window validation function deployed
- [ ] Reservation cap function deployed
- [ ] member_effective_pricing view deployed and tested against all rate combinations
- [ ] Annual date logic confirmed (all pre-launch annuals start September 1, 2026)
- [ ] Payment processor configured for joining fee + recurring combo
- [ ] Membership landing page live at tee365.org/join
- [ ] Founder confirmation email built and tested
- [ ] Founder private update page live at tee365.org/founders
- [ ] Admin alerts configured for Founder cap milestones
- [ ] Cancellation and refund policy live on website
- [ ] Member dashboard live and tested for all three tiers
- [ ] Terms of membership live and linkable from signup flow

---

*Tee365 Holdings, Inc. | tee365.org | Mishawaka, Indiana*
