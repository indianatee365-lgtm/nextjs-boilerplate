-- Distinguishes a free/granted membership (admin direct grant or giveaway-code
-- redemption via grantFreeMembership) from a genuinely paid signup.
--
-- Without this there was no way to tell them apart: grantFreeMembership inserts
-- with comped=false on purpose (comped is used by the membership-audit cron to
-- skip drift checks for subs with no Stripe subscription, and giveaways DO have
-- a real trialing Stripe subscription, so they must stay audited). That left
-- computeRevenue() counting every membership row at full sticker price,
-- reporting $88 of "Membership sign-ups" for September 2026 when $78 of it was
-- two year-long free grants that collected nothing.
alter table memberships
  add column if not exists granted_free boolean not null default false;

comment on column memberships.granted_free is
  'True when the membership was granted free (admin direct grant or giveaway code) rather than paid for at signup. Revenue reporting excludes these from signup revenue; their later paid renewals still count via invoice-paid-subscription_cycle logs.';

-- Backfill the two existing grants, identified by their giveaway log entries.
update memberships m set granted_free = true
where m.stripe_subscription_id in (
  select (regexp_match(detail, 'sub=(sub_[A-Za-z0-9]+)'))[1]
  from admin_logs where event = 'giveaway-subscription-created'
);
