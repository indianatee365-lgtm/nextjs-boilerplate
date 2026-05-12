-- Conflict Detection Test Suite
-- Run: supabase db query --linked -f scripts/test-conflicts.sql

CREATE TEMP TABLE _results (test text, status text, note text);

DO $$
DECLARE
  TEST_USER uuid := 'f8af3afd-0ea5-4b04-8916-f7e773d2c2c5';
  BAY1 uuid := 'eb9eef5b-8e34-4b89-87b1-de21e5849406';
  BAY2 uuid := '4a670c00-bb2b-42fa-b103-9fc9ab7a0be9';
  BAY3 uuid := '1b9d0c93-fc35-433e-b563-b3b4b0222f2a';
  BAY4 uuid := 'dc95c9fd-55f7-41b5-bb32-bb7bb190d0d6';
  BASE timestamptz := '2027-06-15T14:00:00Z';
  ct   int;
BEGIN
  -- 1. Exact overlap
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY1,BASE,BASE+'1h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_1',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY1 AND status IN ('pending','confirmed') AND starts_at < BASE+'1h'::interval AND ends_at > BASE;
  INSERT INTO _results VALUES ('1. Exact overlap, same bay+slot', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');

  -- 2. Partial overlap
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY2,BASE,BASE+'2h'::interval,120,'confirmed',30,60,0,0,0,60,4.20,'pi_test_2',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY2 AND status IN ('pending','confirmed') AND starts_at < BASE+'3h'::interval AND ends_at > BASE+'1h'::interval;
  INSERT INTO _results VALUES ('2. Partial overlap hrs 0-2 vs 1-3', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');

  -- 3. Adjacent (no conflict)
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY3,BASE,BASE+'1h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_3',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY3 AND status IN ('pending','confirmed') AND starts_at < BASE+'2h'::interval AND ends_at > BASE+'1h'::interval;
  INSERT INTO _results VALUES ('3. Adjacent slots hrs 0-1 vs 1-2', CASE WHEN ct=0 THEN 'PASS' ELSE 'FAIL' END, 'expect NO conflict');

  -- 4. Cancelled does not block
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY4,BASE,BASE+'1h'::interval,60,'cancelled',30,30,0,0,0,30,2.10,'pi_test_4',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY4 AND status IN ('pending','confirmed') AND starts_at < BASE+'1h'::interval AND ends_at > BASE;
  INSERT INTO _results VALUES ('4. Cancelled booking same slot', CASE WHEN ct=0 THEN 'PASS' ELSE 'FAIL' END, 'expect NO conflict');

  -- 5. All 4 bays booked
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES
    (TEST_USER,BAY1,BASE+'4h'::interval,BASE+'5h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_5a',now()),
    (TEST_USER,BAY2,BASE+'4h'::interval,BASE+'5h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_5b',now()),
    (TEST_USER,BAY3,BASE+'4h'::interval,BASE+'5h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_5c',now()),
    (TEST_USER,BAY4,BASE+'4h'::interval,BASE+'5h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_5d',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY1 AND status IN ('pending','confirmed') AND starts_at < BASE+'5h'::interval AND ends_at > BASE+'4h'::interval;
  INSERT INTO _results VALUES ('5a. All bays booked — Bay1', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY2 AND status IN ('pending','confirmed') AND starts_at < BASE+'5h'::interval AND ends_at > BASE+'4h'::interval;
  INSERT INTO _results VALUES ('5b. All bays booked — Bay2', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY3 AND status IN ('pending','confirmed') AND starts_at < BASE+'5h'::interval AND ends_at > BASE+'4h'::interval;
  INSERT INTO _results VALUES ('5c. All bays booked — Bay3', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY4 AND status IN ('pending','confirmed') AND starts_at < BASE+'5h'::interval AND ends_at > BASE+'4h'::interval;
  INSERT INTO _results VALUES ('5d. All bays booked — Bay4', CASE WHEN ct>0 THEN 'PASS' ELSE 'FAIL' END, 'expect conflict');

  -- 6. Cross-bay isolation
  INSERT INTO bookings (user_id,bay_id,starts_at,ends_at,duration_minutes,status,price_per_hour,subtotal,membership_discount,coupon_discount,gift_card_applied,total,tax,stripe_payment_intent_id,created_at)
  VALUES (TEST_USER,BAY2,BASE+'6h'::interval,BASE+'7h'::interval,60,'confirmed',30,30,0,0,0,30,2.10,'pi_test_6',now());
  SELECT count(*) INTO ct FROM bookings WHERE bay_id=BAY1 AND status IN ('pending','confirmed') AND starts_at < BASE+'7h'::interval AND ends_at > BASE+'6h'::interval;
  INSERT INTO _results VALUES ('6. Cross-bay (Bay2 booked, check Bay1)', CASE WHEN ct=0 THEN 'PASS' ELSE 'FAIL' END, 'expect NO conflict on Bay1');
END;
$$;

SELECT test, status, note FROM _results ORDER BY test;

SELECT count(*) FILTER (WHERE status='PASS') || ' passed, ' ||
       count(*) FILTER (WHERE status='FAIL') || ' failed' AS summary
FROM _results;

-- Cleanup
DELETE FROM bookings
WHERE user_id = 'f8af3afd-0ea5-4b04-8916-f7e773d2c2c5'
  AND starts_at >= '2027-06-15' AND starts_at < '2027-06-16';
