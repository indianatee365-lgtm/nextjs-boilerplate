-- Applied via Supabase MCP 2026-10-10 as league_matches_unplayed_holes.
alter table public.league_matches add column if not exists unplayed_holes smallint[] not null default '{}';
