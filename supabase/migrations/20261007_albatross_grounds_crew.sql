-- Albatross tier and Grounds Crew hours, 2026-10-07.
--
-- Grounds Crew: an Albatross member gets up to grounds_crew_daily_hours free
-- each weekday morning, midnight to 8am Eastern, booked no more than 24 hours
-- ahead. The app works out how many minutes of a booking are free
-- (lib/membership/grounds-crew.ts) and stores it on the booking. This trigger
-- is the authority on the two limits that span more than one row, because an
-- app-side check can't stop two requests that arrive at the same moment:
--   1. no more than 2 bays in Grounds Crew use at once (walk-ins keep 2)
--   2. one bay per member at a time
--   3. no more than the plan's daily allowance per member per morning
--
-- The plan row goes in INACTIVE. Checkout refuses inactive plans, so nothing
-- is for sale until the switch on /admin/settings is flipped.

alter table public.membership_plans
  add column if not exists grounds_crew_daily_hours numeric not null default 0;

alter table public.bookings
  add column if not exists grounds_crew_minutes integer not null default 0,
  add column if not exists grounds_crew_discount numeric(10,2) not null default 0;

insert into public.membership_plans
  (name, slug, display_name, price_monthly, joining_fee, discount_percent, first_year_discount,
   advance_booking_days, max_active_reservations, max_members, active, grounds_crew_daily_hours)
select 'albatross', 'albatross', 'Albatross', 149.00, 0, 25, null, 21, 4, null, false, 4
where not exists (select 1 from public.membership_plans where slug = 'albatross');

create or replace function public.enforce_grounds_crew_limits()
returns trigger
language plpgsql
as $$
declare
  free_in_use integer;
  used_today integer;
  allowance integer;
  local_day date;
begin
  if coalesce(new.grounds_crew_minutes, 0) <= 0
     or new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  -- One Grounds Crew insert at a time, held until this transaction commits,
  -- so the second of two simultaneous requests counts the first one. Paid
  -- bookings return above and never wait here.
  perform pg_advisory_xact_lock(hashtext('grounds_crew'));

  -- Same notion of "holds a bay" as holdsBayFilter() in
  -- lib/bookings/pending-hold.ts: confirmed, or pending under 15 minutes old.
  select count(*) into free_in_use
  from public.bookings b
  where b.grounds_crew_minutes > 0
    and b.id is distinct from new.id
    and (b.status = 'confirmed'
         or (b.status = 'pending' and b.created_at > now() - interval '15 minutes'))
    and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at);

  if free_in_use >= 2 then
    raise exception 'GROUNDS_CREW_FULL';
  end if;

  -- One bay per member: their own free time can't overlap itself.
  if exists (
    select 1 from public.bookings b
    where b.user_id = new.user_id
      and b.grounds_crew_minutes > 0
      and b.id is distinct from new.id
      and (b.status = 'confirmed'
           or (b.status = 'pending' and b.created_at > now() - interval '15 minutes'))
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'GROUNDS_CREW_ONE_BAY';
  end if;

  select coalesce(max(p.grounds_crew_daily_hours), 0) * 60 into allowance
  from public.memberships m
  join public.membership_plans p on p.id = m.plan_id
  where m.user_id = new.user_id and m.status = 'active';

  local_day := (new.starts_at at time zone 'America/Indiana/Indianapolis')::date;

  select coalesce(sum(b.grounds_crew_minutes), 0) into used_today
  from public.bookings b
  where b.user_id = new.user_id
    and b.grounds_crew_minutes > 0
    and b.id is distinct from new.id
    and (b.status = 'confirmed'
         or (b.status = 'pending' and b.created_at > now() - interval '15 minutes'))
    and (b.starts_at at time zone 'America/Indiana/Indianapolis')::date = local_day;

  if used_today + new.grounds_crew_minutes > allowance then
    raise exception 'GROUNDS_CREW_DAILY_LIMIT';
  end if;

  return new;
end;
$$;

-- INSERT only, on purpose. A pending booking flips to confirmed in the Stripe
-- webhook after the customer has paid; re-checking there could reject a
-- booking somebody has already paid for.
drop trigger if exists bookings_grounds_crew_limits on public.bookings;
create trigger bookings_grounds_crew_limits
  before insert on public.bookings
  for each row execute function public.enforce_grounds_crew_limits();
