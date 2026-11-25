-- After-session "your range shots are saved" text (2026-11-19).
alter table bookings add column if not exists shots_sms_sent_at timestamptz;
alter table profiles add column if not exists shots_page_viewed_at timestamptz;
-- Ships OFF. While off, only admin accounts get the text (for testing).
insert into admin_settings (key, value, updated_at) values ('range_shots_sms', false, now()) on conflict (key) do nothing;
