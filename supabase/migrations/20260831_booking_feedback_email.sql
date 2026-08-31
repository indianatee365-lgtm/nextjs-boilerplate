-- Tracks whether the post-session "how was your round" feedback/review
-- request email has gone out for a booking, so the cron never double-sends.
alter table bookings add column if not exists feedback_email_sent_at timestamptz;
