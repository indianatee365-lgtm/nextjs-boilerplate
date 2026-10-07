-- Two-bay booking, 2026-10-07.
--
-- A group booking is two rows: the first bay (the parent) carries the Stripe
-- payment intent and charge for BOTH bays, and the second bay points at it
-- through parent_booking_id with no payment of its own. stripe_payment_intent_id
-- is UNIQUE, which is why the second bay cannot simply share it. Each row keeps
-- its own price fields, so revenue reporting that sums totals stays correct.
-- lib/bookings/group.ts is the one place that confirms, cancels and refunds a
-- group as a unit.

alter table public.bookings
  add column if not exists parent_booking_id uuid references public.bookings(id);

create index if not exists bookings_parent_booking_id_idx
  on public.bookings (parent_booking_id)
  where parent_booking_id is not null;

-- Off until Jerrod turns it on from /admin/settings. Inserted explicitly
-- because getAdminSetting() treats a missing row as ON.
insert into public.admin_settings (key, value, updated_at)
values ('two_bay_booking', false, now())
on conflict (key) do nothing;
