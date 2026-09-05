alter table bay_agent_status add column if not exists last_no_shot_alert_at timestamptz;

insert into admin_settings (key, value)
values ('notify_no_shot_alert', true)
on conflict (key) do nothing;
