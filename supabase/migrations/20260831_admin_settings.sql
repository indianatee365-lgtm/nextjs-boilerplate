-- Simple key/value toggle store for admin-controlled feature flags. First
-- use: notify_new_bookings, so Jerrod can silence the owner SMS on new
-- bookings if things get busy, without touching code. Extensible for
-- future toggles without another migration.
create table if not exists admin_settings (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now()
);

insert into admin_settings (key, value)
values ('notify_new_bookings', true)
on conflict (key) do nothing;

alter table admin_settings enable row level security;

-- Only service_role (server-side admin routes) touches this table directly -
-- same pattern as bay_agent_status.
revoke all on admin_settings from anon, authenticated;
