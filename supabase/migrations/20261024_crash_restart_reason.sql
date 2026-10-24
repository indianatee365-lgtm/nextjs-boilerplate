-- Why GSPro last went away mid-rental: 'customer_exit' (the customer used GSPro's
-- Exit button, a clean shutdown in Player.log), 'crash', or 'unknown'. Null on rows
-- from agents that predate it.
alter table public.bay_agent_status add column if not exists last_crash_restart_reason text;
