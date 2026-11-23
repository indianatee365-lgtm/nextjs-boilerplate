-- Hour pack sales on /admin/sales (2026-11-23). hour_credits had no price, so
-- a sold pack was invisible everywhere except the owner text. Purchased rows
-- (stripe_payment_id set) now carry what was charged and who bought them.
alter table hour_credits add column if not exists amount_paid numeric(10,2);
alter table hour_credits add column if not exists buyer_name text;
alter table hour_credits add column if not exists buyer_email text;
