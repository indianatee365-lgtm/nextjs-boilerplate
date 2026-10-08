-- Format changed 2026-10-07 from two-person scramble to A/B match play.
alter table public.league_participants
  add column if not exists starting_handicap numeric,
  add column if not exists starting_handicap_basis text check (starting_handicap_basis in ('index', 'typical_score')),
  add column if not exists starting_handicap_input numeric,
  add column if not exists forward_tees boolean not null default false;
