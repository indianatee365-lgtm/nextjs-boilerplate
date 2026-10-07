-- Thursday Night League, phase 1 (signup), 2026-10-07.
--
-- Two-person scramble teams. A captain signs up, the partner accepts through
-- an invite link; both need an account, a card on file and the waiver. A tee
-- time holds teams_per_tee_time teams (2 per bay x 4 bays). Signup opens in
-- windows: founders, then Eagle/Albatross members, then everyone.

alter table public.leagues
  add column if not exists format text,
  add column if not exists skip_dates date[] not null default '{}',
  add column if not exists tee_times time[] not null default '{17:30,19:30}',
  add column if not exists teams_per_tee_time integer not null default 8,
  add column if not exists founders_opens_at timestamptz,
  add column if not exists members_opens_at timestamptz,
  add column if not exists public_opens_at timestamptz;

create table if not exists public.league_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  captain_user_id uuid not null references public.profiles(id),
  partner_user_id uuid references public.profiles(id),
  partner_invite_name text,
  partner_invite_email text,
  invite_token text not null unique,
  tee_time time not null,
  status text not null default 'pending_partner'
    check (status in ('pending_partner', 'confirmed', 'waitlisted', 'withdrawn')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists league_teams_league_idx on public.league_teams (league_id, tee_time, status);
alter table public.league_teams enable row level security;

alter table public.league_participants
  add column if not exists team_id uuid references public.league_teams(id) on delete cascade,
  add column if not exists role text check (role in ('captain', 'partner')),
  add column if not exists charges_authorized_at timestamptz;
create unique index if not exists league_participants_one_per_league
  on public.league_participants (league_id, user_id);

-- A tee time can't take more teams than its bays hold, even when two captains
-- grab the last spot at the same moment. Waitlisted teams don't count.
create or replace function public.enforce_league_tee_time_capacity()
returns trigger
language plpgsql
as $$
declare
  cap integer;
  taken integer;
begin
  if new.status not in ('pending_partner', 'confirmed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('pending_partner', 'confirmed') and old.tee_time = new.tee_time then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('league:' || new.league_id::text));
  select teams_per_tee_time into cap from public.leagues where id = new.league_id;
  select count(*) into taken from public.league_teams t
    where t.league_id = new.league_id and t.tee_time = new.tee_time
      and t.status in ('pending_partner', 'confirmed') and t.id is distinct from new.id;
  if taken >= coalesce(cap, 8) then
    raise exception 'LEAGUE_TEE_TIME_FULL';
  end if;
  return new;
end;
$$;

drop trigger if exists league_teams_capacity on public.league_teams;
create trigger league_teams_capacity
  before insert or update of status, tee_time on public.league_teams
  for each row execute function public.enforce_league_tee_time_capacity();

-- The season itself. Kept inactive (admin preview only) until Jerrod approves.
update public.leagues set
  name = 'Thursday Night League',
  slug = 'thursday-night',
  description = 'Two-person scramble, 9 holes, Thursday nights at 5:30 or 7:30. Eight weeks, October 22 to December 17, no league on Thanksgiving.',
  format = 'Two-person scramble',
  day_of_week = 4,
  start_time = '17:30',
  duration_minutes = 240,
  starts_on = '2026-10-22',
  ends_on = '2026-12-17',
  skip_dates = '{2026-11-26}',
  tee_times = '{17:30,19:30}',
  teams_per_tee_time = 8,
  max_players = 32,
  price_per_session = 30,
  prize_pool_per_session = 5,
  signup_closes_on = '2026-10-20',
  founders_opens_at = '2026-10-09 09:00 America/Indiana/Indianapolis',
  members_opens_at = '2026-10-12 09:00 America/Indiana/Indianapolis',
  public_opens_at = '2026-10-14 09:00 America/Indiana/Indianapolis',
  active = false
where slug = 'tuesday-night';
