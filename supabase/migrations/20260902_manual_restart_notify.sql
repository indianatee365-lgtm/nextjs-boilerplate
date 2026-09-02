alter table bay_agent_status add column if not exists last_manual_restart_at timestamptz;

insert into admin_settings (key, value)
values ('notify_restart_clicks', true)
on conflict (key) do nothing;
