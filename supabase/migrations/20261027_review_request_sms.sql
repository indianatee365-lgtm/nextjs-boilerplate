-- One-time Google review request text (2026-10-27). review_sms_sent_at is set
-- the moment the text is claimed, so each customer is asked at most once ever.
-- google_review_at marks customers known to have already left a Google review,
-- so they are never asked.
alter table public.profiles add column if not exists review_sms_sent_at timestamptz;
alter table public.profiles add column if not exists google_review_at timestamptz;
