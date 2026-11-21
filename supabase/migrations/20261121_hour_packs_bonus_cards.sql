-- Hour packs and Black Friday bonus gift cards (2026-11-21).
alter table hour_credits add column if not exists stripe_payment_id text unique;
alter table gift_cards add column if not exists valid_from timestamptz;
alter table gift_cards add column if not exists days_allowed int[];
