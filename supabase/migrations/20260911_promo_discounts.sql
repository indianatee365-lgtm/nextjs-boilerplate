-- Admin-controlled site-wide discounts, replacing hardcoded date windows.
--
-- The gift card "20% off through opening day" sale lived as a hardcoded date
-- comparison in app/api/gift-cards/payment-intent/route.ts. It silently
-- expired on 2026-09-01 while the marketing copy kept advertising it, so the
-- site promised a discount it no longer applied. Putting this in the database
-- with an admin UI means starting or ending a sale is a toggle, and the
-- storefront copy reads the same source of truth instead of drifting.
create table if not exists promo_discounts (
  kind         text primary key check (kind in ('gift_card', 'booking_hours')),
  percent_off  numeric(5,2) not null default 0 check (percent_off >= 0 and percent_off <= 100),
  active       boolean not null default false,
  updated_at   timestamptz not null default now()
);

comment on table promo_discounts is
  'Site-wide promotional discounts managed from /admin/discounts. A discount only applies when active = true AND percent_off > 0.';
comment on column promo_discounts.kind is
  'gift_card = percent off the purchase price of a gift card (face value is unchanged). booking_hours = percent off the bay-time subtotal, applied before the membership discount so the two stack sequentially.';

insert into promo_discounts (kind, percent_off, active) values
  ('gift_card', 0, false),
  ('booking_hours', 0, false)
on conflict (kind) do nothing;

-- Server-only table: no policies, so anon/authenticated are denied by default
-- and only the service role (our server routes) can read or write it. Matches
-- how admin_settings and admin_logs are already handled.
alter table promo_discounts enable row level security;

-- Records the site-wide sale amount taken off a booking. Without this the
-- money is still correct (subtotal is stored pre-discount, total post) but
-- there'd be no way to tell a sale apart from a membership or coupon discount
-- when reporting on why a booking was cheaper than list price.
alter table bookings
  add column if not exists promo_discount numeric(10,2) not null default 0;

comment on column bookings.promo_discount is
  'Site-wide promotional discount applied at booking time, in dollars. Applied to the post-credit subtotal BEFORE the membership discount, so the two stack sequentially.';
