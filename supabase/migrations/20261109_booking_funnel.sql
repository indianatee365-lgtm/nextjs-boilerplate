-- Booking funnel (2026-11-09): which step of /book each visitor reached, one
-- row per step per browser tab, so /admin/funnel can show where people drop
-- off. "Paid" is not a row here: it is read from the booking the "reserved"
-- row points at, so it cannot disagree with the bookings table.
create table if not exists booking_funnel_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  step text not null check (step in ('view', 'date', 'time', 'login', 'reserved')),
  booking_id uuid references bookings(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, step)
);

create index if not exists booking_funnel_events_created_idx on booking_funnel_events (created_at);

alter table booking_funnel_events enable row level security;
