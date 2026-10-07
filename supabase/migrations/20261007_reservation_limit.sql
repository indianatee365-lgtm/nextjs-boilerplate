-- Upcoming-reservation limit, 2026-10-07.
--
-- membership_plans.max_active_reservations had been shown on /join, checkout,
-- the welcome emails and /account since launch, but nothing ever enforced it,
-- and non-members had no limit at all. Counted by time slot, not by bay:
-- two bays booked for the same start time are one reservation, because the
-- website has no two-bay booking and a group books its second bay as a second
-- booking. Rules, all Jerrod's call 2026-10-07:
--   * non-members hold 1 time slot, members hold their plan's number
--     (Birdie 2, Eagle 3, Founders 3, Albatross 4)
--   * at most 2 bays in one time slot online (the 2026-09-18 rule; bigger
--     groups go through Jerrod)
--   * Grounds Crew bookings don't count, admin-made bookings and admins'
--     own bookings are exempt
--   * a reservation counts until its session ends
-- lib/bookings/reservation-limit.ts checks the same thing first so the
-- customer gets a clear message before payment starts. This trigger is what
-- holds when two clicks land together.

create or replace function public.enforce_reservation_limit()
returns trigger
language plpgsql
as $$
declare
  slot_limit integer;
  same_slot_bays integer;
  other_slots integer;
begin
  if new.status not in ('pending', 'confirmed')
     or coalesce(new.grounds_crew_minutes, 0) > 0
     or coalesce(new.source, 'web') = 'admin'
     or exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin') then
    return new;
  end if;

  -- Per customer, so it never makes anyone else wait.
  perform pg_advisory_xact_lock(hashtext('reservations:' || new.user_id::text));

  -- Same notion of "holds a bay" as holdsBayFilter() in
  -- lib/bookings/pending-hold.ts: confirmed, or pending under 15 minutes old.
  select count(*) into same_slot_bays
  from public.bookings b
  where b.user_id = new.user_id
    and b.id is distinct from new.id
    and b.starts_at = new.starts_at
    and coalesce(b.grounds_crew_minutes, 0) = 0
    and (b.status = 'confirmed'
         or (b.status = 'pending' and b.created_at > now() - interval '15 minutes'));

  if same_slot_bays >= 2 then
    raise exception 'RESERVATION_SLOT_BAY_LIMIT';
  end if;
  if same_slot_bays > 0 then
    return new; -- a second bay in a slot they already hold
  end if;

  select coalesce(max(p.max_active_reservations), 1) into slot_limit
  from public.memberships m
  join public.membership_plans p on p.id = m.plan_id
  where m.user_id = new.user_id and m.status = 'active';

  select count(distinct b.starts_at) into other_slots
  from public.bookings b
  where b.user_id = new.user_id
    and b.id is distinct from new.id
    and b.ends_at > now()
    and coalesce(b.grounds_crew_minutes, 0) = 0
    and (b.status = 'confirmed'
         or (b.status = 'pending' and b.created_at > now() - interval '15 minutes'));

  if other_slots >= slot_limit then
    raise exception 'RESERVATION_LIMIT';
  end if;

  return new;
end;
$$;

-- INSERT only, for the same reason as bookings_grounds_crew_limits: the
-- pending to confirmed update happens after the customer has paid.
drop trigger if exists bookings_reservation_limit on public.bookings;
create trigger bookings_reservation_limit
  before insert on public.bookings
  for each row execute function public.enforce_reservation_limit();
