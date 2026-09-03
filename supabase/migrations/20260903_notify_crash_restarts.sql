insert into admin_settings (key, value)
values ('notify_crash_restarts', true)
on conflict (key) do nothing;
