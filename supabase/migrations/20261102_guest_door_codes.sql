-- Guest door codes (2026-11-02): one-day front door PINs for people who are
-- not customers (landlord, contractors), issued from /admin/door. Same UniFi
-- User + Access Policy + Schedule as a booking code, but with no booking or
-- bay behind it. The revoke-access cron deletes the UniFi side once ends_at
-- passes, since a weekday schedule would otherwise work again next week.
create table if not exists guest_door_codes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_code text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unifi_user_id text,
  unifi_access_policy_id text,
  unifi_schedule_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists guest_door_codes_open_idx on guest_door_codes (ends_at) where revoked_at is null;

alter table guest_door_codes enable row level security;
