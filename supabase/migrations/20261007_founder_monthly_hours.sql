-- Founders monthly free hours: at most one grant per founder per month.
create unique index if not exists hour_credits_founder_monthly_uniq
  on public.hour_credits (user_id, reason)
  where reason like 'Founders monthly hours %';
