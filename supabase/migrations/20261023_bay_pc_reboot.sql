-- Admin "Restart PC" button on /admin/bays. The bay's TeeBayService (SYSTEM)
-- reads this from /api/bay-agent/sync and reboots Windows once per new value.
-- Separate from restart_requested_at, which only restarts the sim programs.
alter table public.bay_agent_status add column if not exists reboot_requested_at timestamptz;
