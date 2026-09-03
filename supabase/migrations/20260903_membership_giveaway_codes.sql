-- Membership giveaway codes: printable, single-use codes that grant a free
-- trial period (1 month or 1 year) on a real Stripe subscription. Unlike the
-- existing `comped` membership path (manually added, no Stripe subscription,
-- stays free forever by design), a redeemed code creates an actual
-- subscription with trial_end set to the free period's end - Stripe auto-
-- charges the plan's standard price when the trial ends, with no admin
-- action required. See lib/membership/giveaway.ts for the redemption flow.

create table if not exists membership_giveaway_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  plan_id uuid not null references membership_plans(id),
  free_period text not null check (free_period in ('month', 'year')),
  note text,
  expires_at timestamptz,
  active boolean not null default true,
  redeemed_by uuid references profiles(id),
  redeemed_at timestamptz,
  membership_id uuid references memberships(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists membership_giveaway_codes_code_idx on membership_giveaway_codes(code);

alter table membership_giveaway_codes enable row level security;

create policy "Admins can manage giveaway codes" on membership_giveaway_codes
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Users can view own redeemed giveaway codes" on membership_giveaway_codes
  for select
  using (auth.uid() = redeemed_by);
