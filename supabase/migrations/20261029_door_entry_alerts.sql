-- Door entry alerts (2026-10-29). UniFi Access posts every door unlock to
-- /api/unifi/webhook, which matches the PIN back to its booking and texts the
-- owner. door_webhook holds the signing secret UniFi returns when the endpoint
-- is registered (always one row). door_entries is the log of every unlock;
-- alerted keeps re-entries on the same booking from texting twice.
create table if not exists public.door_webhook (
  id int primary key default 1 check (id = 1),
  unifi_endpoint_id text not null,
  secret text not null,
  created_at timestamptz not null default now()
);
alter table public.door_webhook enable row level security;

create table if not exists public.door_entries (
  id uuid primary key default gen_random_uuid(),
  unifi_event_id text unique,
  unifi_user_id text,
  booking_id uuid references public.bookings(id),
  actor_name text,
  auth_type text,
  result text,
  first_visit boolean,
  alerted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists door_entries_booking_id_idx on public.door_entries(booking_id);
alter table public.door_entries enable row level security;

-- Explicit rows, because getAdminSetting treats a missing key as on.
insert into public.admin_settings (key, value) values
  ('notify_door_entries', true),
  ('notify_door_entries_first_visit_only', true)
on conflict (key) do nothing;
