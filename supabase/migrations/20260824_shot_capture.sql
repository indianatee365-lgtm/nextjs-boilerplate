alter table bookings add column if not exists roster_links jsonb;

create table if not exists shots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  bay_id uuid references bays(id) on delete set null,
  user_id uuid references profiles(id) on delete cascade,
  hitter_name text,
  shot_number integer,
  club text,
  ball_speed_mph numeric,
  club_speed_mph numeric,
  carry_yards numeric,
  total_spin numeric,
  back_spin numeric,
  side_spin numeric,
  hla numeric,
  vla numeric,
  path numeric,
  angle_of_attack numeric,
  face_to_target numeric,
  device_id text,
  source text not null default 'connect_debug',
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shots_user_id_created_at_idx on shots (user_id, created_at desc);
create index if not exists shots_booking_id_idx on shots (booking_id);

alter table shots enable row level security;

create policy "shots_select_own" on shots for select
  using (auth.uid() = user_id);
