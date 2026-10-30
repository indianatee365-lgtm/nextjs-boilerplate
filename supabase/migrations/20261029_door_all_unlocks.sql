-- Text on every door unlock, off by default (2026-10-29). Explicit row
-- because getAdminSetting treats a missing key as on.
insert into public.admin_settings (key, value) values ('notify_all_door_unlocks', false)
on conflict (key) do nothing;
