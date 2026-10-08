-- Thursday Night League, phase 2A (2026-10-08): weeks, schedule, weekly charges.

-- One row per league night. holes = [{"n":1,"par":4,"hcp":7}, ...] for the 9
-- holes played, entered from the GSPro scorecard (hcp = the hole's 18-hole
-- handicap index, used to rank the nine for strokes).
create table if not exists public.league_weeks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_no integer not null,
  play_date date not null,
  kind text not null check (kind in ('learning', 'match', 'finale')),
  course text not null,
  nine text not null,
  holes jsonb not null default '[]',
  cancelled boolean not null default false,
  unique (league_id, week_no)
);
alter table public.league_weeks enable row level security;

-- Who plays whom, where. away_team_id null = a bye.
create table if not exists public.league_matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_id uuid not null references public.league_weeks(id) on delete cascade,
  tee_time time not null,
  bay_number integer,
  home_team_id uuid not null references public.league_teams(id) on delete cascade,
  away_team_id uuid references public.league_teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists league_matches_week_idx on public.league_matches (week_id);
alter table public.league_matches enable row level security;

-- One charge per payer per league night. The unique constraint is what makes a
-- second run (or two runs at once) unable to charge anyone twice.
create table if not exists public.league_charges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_id uuid not null references public.league_weeks(id) on delete cascade,
  payer_user_id uuid not null references public.profiles(id),
  player_user_ids uuid[] not null,
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'skipped')),
  stripe_payment_intent_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, payer_user_id)
);
alter table public.league_charges enable row level security;

-- Seed the eight nights for the Thursday Night League (idempotent).
insert into public.league_weeks (league_id, week_no, play_date, kind, course, nine)
select l.id, w.week_no, w.play_date, w.kind, w.course, w.nine
from public.leagues l
cross join (values
  (1, date '2026-10-22', 'learning', 'Payne''s Valley', 'Front 9'),
  (2, date '2026-10-29', 'learning', 'Mammoth Dunes', 'Front 9'),
  (3, date '2026-11-05', 'match', 'St Andrews (Old Course)', 'Front 9'),
  (4, date '2026-11-12', 'match', 'Arcadia Bluffs', 'Front 9'),
  (5, date '2026-11-19', 'match', 'Bandon Trails', 'Front 9'),
  (6, date '2026-12-03', 'match', 'Streamsong Blue', 'Back 9'),
  (7, date '2026-12-10', 'match', 'Muirfield Village', 'Back 9'),
  (8, date '2026-12-17', 'finale', 'Pebble Beach', 'Front 9')
) as w(week_no, play_date, kind, course, nine)
where l.slug = 'thursday-night'
on conflict (league_id, week_no) do nothing;
