-- Hour credits: give away playing time (hours), not dollars.
-- Two grant paths:
--   1. Code-based voucher (raffle/sponsorship): user_id is NULL until someone redeems the code.
--   2. Direct grant to an existing user: user_id set at creation, code is NULL.
-- Hours are consumed automatically at booking time (oldest expiry first) and reduce
-- billable duration before any dollar discounts.

create table if not exists hour_credits (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  user_id uuid references profiles(id),
  hours numeric not null check (hours > 0),
  hours_remaining numeric not null check (hours_remaining >= 0),
  reason text,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  -- A credit is either a voucher (has a code) or a direct grant (has a user from birth)
  constraint hour_credits_code_or_user check (code is not null or user_id is not null)
);

create index if not exists hour_credits_user_idx on hour_credits (user_id) where user_id is not null;

create table if not exists hour_credit_uses (
  id uuid primary key default gen_random_uuid(),
  hour_credit_id uuid not null references hour_credits(id),
  booking_id uuid not null references bookings(id),
  user_id uuid not null references profiles(id),
  hours_used numeric not null,  -- negative rows are restorations from cancellations
  created_at timestamptz not null default now()
);

create index if not exists hour_credit_uses_booking_idx on hour_credit_uses (booking_id);
create index if not exists hour_credit_uses_credit_idx on hour_credit_uses (hour_credit_id);

alter table bookings add column if not exists credit_hours_applied numeric not null default 0;
alter table bookings add column if not exists credit_discount numeric not null default 0;

-- RLS: users can read their own credits and usage; all writes go through the service role.
alter table hour_credits enable row level security;
alter table hour_credit_uses enable row level security;

drop policy if exists "Users can view own hour credits" on hour_credits;
create policy "Users can view own hour credits"
  on hour_credits for select
  using (auth.uid() = user_id);

drop policy if exists "Users can view own hour credit uses" on hour_credit_uses;
create policy "Users can view own hour credit uses"
  on hour_credit_uses for select
  using (auth.uid() = user_id);
