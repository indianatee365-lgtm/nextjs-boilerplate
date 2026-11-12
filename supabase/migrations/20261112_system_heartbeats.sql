-- Website-side watchdog (2026-11-12): labserver's uptime monitor checks in
-- here through /api/health every minute, and /api/cron/watchdog (Vercel)
-- texts Jerrod when it goes quiet. Also holds that cron's own alert state.
create table if not exists system_heartbeats (
  name text primary key,
  last_seen_at timestamptz,
  alerted boolean not null default false
);

alter table system_heartbeats enable row level security;
