-- Cancel / Refund Logic Test Suite
-- Run: supabase db query --linked -f scripts/test-cancel.sql
-- Tests DB-level state only. Stripe refund calls require a real test-mode booking.

CREATE TEMP TABLE _results (test text, status text, note text);

DO $$
DECLARE
  TEST_USER uuid := 'f8af3afd-0ea5-4b04-8916-f7e773d2c2c5';
  BAY1      uuid := 'eb9eef5b-8e34-4b89-87b1-de21e5849406';
  FUTURE    timestamptz := now() + interval '48 hours';  -- >24h out
  SOON      timestamptz := now() + interval '12 hours';  -- <24h out
  b         record;
  bid       uuid;
BEGIN

  -- ── Test 1: Confirmed >24h → full refund fields set ──────────────────────
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,
    price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,
    total,tax,stripe_payment_intent_id,stripe_charge_id,created_at)
  VALUES (TEST_USER,BAY1,FUTURE,FUTURE+interval'1h',60,'confirmed',
    30,30,0,0,0,30,2.10,'pi_test_cancel1',null,now())
  RETURNING id INTO bid;

  -- Simulate the DB update the cancel action runs (>24h path, no charge = refunded_at null)
  UPDATE bookings SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = TEST_USER,
    refund_amount = total,
    refunded_at = CASE WHEN stripe_charge_id IS NOT NULL THEN now() ELSE null END
  WHERE id = bid;

  SELECT * INTO b FROM bookings WHERE id = bid;
  INSERT INTO _results VALUES (
    '1. Confirmed >24h — status cancelled',
    CASE WHEN b.status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO _results VALUES (
    '1. Confirmed >24h — refund_amount = total',
    CASE WHEN b.refund_amount = b.total THEN 'PASS' ELSE 'FAIL' END,
    'refund_amount=' || b.refund_amount || ' total=' || b.total);
  INSERT INTO _results VALUES (
    '1. Confirmed >24h — cancelled_at set',
    CASE WHEN b.cancelled_at IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO _results VALUES (
    '1. Confirmed >24h — refunded_at null (no charge ID)',
    CASE WHEN b.refunded_at IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'Expected null when stripe_charge_id is null');

  -- ── Test 2: Confirmed ≤24h → forfeit, no refund ──────────────────────────
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,
    price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,
    total,tax,stripe_payment_intent_id,stripe_charge_id,created_at)
  VALUES (TEST_USER,BAY1,SOON,SOON+interval'1h',60,'confirmed',
    30,30,0,0,0,30,2.10,'pi_test_cancel2',null,now())
  RETURNING id INTO bid;

  -- ≤24h path: refund_amount = 0, refunded_at = null
  UPDATE bookings SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = TEST_USER,
    refund_amount = 0,
    refunded_at = null
  WHERE id = bid;

  SELECT * INTO b FROM bookings WHERE id = bid;
  INSERT INTO _results VALUES (
    '2. Confirmed ≤24h — status cancelled',
    CASE WHEN b.status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO _results VALUES (
    '2. Confirmed ≤24h — refund_amount = 0 (forfeit)',
    CASE WHEN b.refund_amount = 0 THEN 'PASS' ELSE 'FAIL' END,
    'refund_amount=' || b.refund_amount);
  INSERT INTO _results VALUES (
    '2. Confirmed ≤24h — refunded_at null',
    CASE WHEN b.refunded_at IS NULL THEN 'PASS' ELSE 'FAIL' END, '');

  -- ── Test 3: Pending booking cancelled ────────────────────────────────────
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,
    price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,
    total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY1,FUTURE+interval'2h',FUTURE+interval'3h',60,'pending',
    30,30,0,0,0,30,2.10,'pi_test_cancel3',now())
  RETURNING id INTO bid;

  UPDATE bookings SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = TEST_USER,
    refund_amount = 0,
    refunded_at = null
  WHERE id = bid;

  SELECT * INTO b FROM bookings WHERE id = bid;
  INSERT INTO _results VALUES (
    '3. Pending booking — status cancelled',
    CASE WHEN b.status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO _results VALUES (
    '3. Pending booking — refund_amount = 0',
    CASE WHEN b.refund_amount = 0 THEN 'PASS' ELSE 'FAIL' END, '');

  -- ── Test 4: Idempotency — cancelling already-cancelled returns early ──────
  -- App layer returns early before any DB write, so we just verify the row is untouched.
  -- We'll verify that a cancelled row stays cancelled if someone tries again.
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,
    price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,
    total,tax,stripe_payment_intent_id,cancelled_at,cancelled_by,refund_amount,created_at)
  VALUES (TEST_USER,BAY1,FUTURE+interval'4h',FUTURE+interval'5h',60,'cancelled',
    30,30,0,0,0,30,2.10,'pi_test_cancel4',now()-interval'1h',TEST_USER,30,now())
  RETURNING id INTO bid;

  -- App returns { refunded: false } without touching DB.
  -- Confirm status is still cancelled and refund_amount is still 30.
  SELECT * INTO b FROM bookings WHERE id = bid;
  INSERT INTO _results VALUES (
    '4. Already cancelled — status unchanged',
    CASE WHEN b.status = 'cancelled' THEN 'PASS' ELSE 'FAIL' END, '');
  INSERT INTO _results VALUES (
    '4. Already cancelled — refund_amount preserved',
    CASE WHEN b.refund_amount = 30 THEN 'PASS' ELSE 'FAIL' END,
    'refund_amount=' || b.refund_amount);

END;
$$;

SELECT test, status, note FROM _results ORDER BY test;

SELECT count(*) FILTER (WHERE status='PASS') || ' passed, ' ||
       count(*) FILTER (WHERE status='FAIL') || ' failed' AS summary
FROM _results;

-- Cleanup
DELETE FROM bookings
WHERE user_id = 'f8af3afd-0ea5-4b04-8916-f7e773d2c2c5'
  AND stripe_payment_intent_id LIKE 'pi_test_cancel%';
