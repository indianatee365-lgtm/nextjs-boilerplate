-- Applied via Supabase MCP 2026-10-11 as ticketed_events_details.
alter table public.ticketed_events add column if not exists details text not null default '';
