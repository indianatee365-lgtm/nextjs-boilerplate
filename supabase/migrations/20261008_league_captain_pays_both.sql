-- "Paying for both?" (2026-10-08): captain can cover both players weekly fee.
alter table public.league_teams add column if not exists captain_pays_for_both boolean not null default false;
alter table public.league_participants add column if not exists payer_user_id uuid references public.profiles(id);
