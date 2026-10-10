-- Applied via Supabase MCP 2026-10-10 as league_night_door_and_bays.
create table if not exists public.league_nights (
  week_id uuid primary key references public.league_weeks(id) on delete cascade,
  door_pin text, door_user_id text, door_policy_id text, door_schedule_id text,
  door_granted_at timestamptz, door_revoked_at timestamptz, door_error text,
  bays_turned_on uuid[] not null default '{}', bays_on_at timestamptz, bays_off_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.league_nights enable row level security;
revoke all on public.league_nights from anon, authenticated;
update public.blocked_times set starts_at = starts_at - interval '30 minutes'
where reason = 'Thursday Night League' and (starts_at at time zone 'America/Indiana/Indianapolis')::time = '17:30';
