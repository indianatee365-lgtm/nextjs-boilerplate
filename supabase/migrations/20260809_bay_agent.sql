-- Migration: bay-PC automation (booking-driven on/off, kiosk lockdown, self-serve extend)
-- See docs/bay-agent.md for full context.

ALTER TABLE bays
  ADD COLUMN IF NOT EXISTS agent_token TEXT DEFAULT gen_random_uuid()::text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS extend_token TEXT DEFAULT gen_random_uuid()::text;

CREATE TABLE IF NOT EXISTS bay_agent_status (
  bay_id               UUID PRIMARY KEY REFERENCES bays(id) ON DELETE CASCADE,
  last_heartbeat_at     TIMESTAMPTZ,
  agent_version         TEXT,
  enforcement_mode       TEXT,             -- 'shadow' | 'live', as reported by the agent
  session_state         TEXT,              -- 'occupied' | 'available', as observed by the agent
  sim_running           BOOLEAN,
  running_processes     JSONB,
  last_crash_restart_at TIMESTAMPTZ,
  kiosk_kills           JSONB DEFAULT '[]'::jsonb,   -- rolling log of {process, at} blocked-process events
  override_state        TEXT,              -- 'occupied' | 'available' | 'maintenance' | NULL (no override)
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every bay gets a status row up front so the dashboard has something to join
-- against even before an agent has ever checked in.
INSERT INTO bay_agent_status (bay_id)
SELECT id FROM bays
ON CONFLICT (bay_id) DO NOTHING;

-- No RLS here, matching sms_messages (20260802_sms_messages.sql) — this codebase's
-- convention for tables the admin dashboard subscribes to directly via Supabase
-- Realtime. Writes only ever happen through the service-role /api/bay-agent/sync
-- and admin override routes, never client-side.
--
-- No migrations in this repo ever run ALTER PUBLICATION supabase_realtime ADD TABLE,
-- so this project's publication is presumably FOR ALL TABLES already (matches
-- sms_messages working without one). If BayStatusRefresher doesn't receive events
-- after this migration, check Database > Replication in the Supabase dashboard.
