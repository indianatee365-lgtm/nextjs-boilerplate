-- Scheduled email campaigns (2026-11-21). Sent by /api/cron/scheduled-campaigns.
alter table email_campaigns add column if not exists scheduled_for timestamptz;
