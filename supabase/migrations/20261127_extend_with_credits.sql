-- Extensions paid (fully or partly) with hour credits and/or a gift card.
-- A separate function from apply_booking_extension on purpose: card-only
-- extensions keep calling the original, unchanged.
--
-- One transaction does the whole thing: lock the booking, move ends_at,
-- deduct hour credits (soonest expiry first) and the gift card. The
-- "ends_at < p_new_ends_at" guard is the idempotency key, exactly like the
-- original, so finalize + webhook racing for the same payment apply it once.
--
-- p_strict = true (nothing was charged by card): if the credits or gift card
-- balance no longer cover what was quoted, raise and change nothing.
-- p_strict = false (card already charged for the rest): apply the extension
-- anyway, deduct what is there, and report the shortfall so it gets flagged.
create or replace function public.apply_booking_extension_with_credits(
  p_booking_id uuid,
  p_new_ends_at timestamptz,
  p_amount numeric,
  p_credit_hours numeric,
  p_gift_card_id uuid,
  p_gift_card_amount numeric,
  p_strict boolean
)
returns table(applied boolean, added_minutes integer, new_extension_total integer,
              credit_hours_used numeric, gift_card_used numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking record;
  v_added integer;
  v_left numeric := coalesce(p_credit_hours, 0);
  v_take numeric;
  v_credit record;
  v_gc record;
  v_gc_take numeric := 0;
  v_new_balance numeric;
begin
  select id, user_id, ends_at, extension_minutes into v_booking
  from bookings
  where id = p_booking_id and status = 'confirmed' and ends_at < p_new_ends_at
  for update;

  if not found then
    return query select false, 0, coalesce(
      (select b.extension_minutes from bookings b where b.id = p_booking_id), 0), 0::numeric, 0::numeric;
    return;
  end if;

  v_added := round(extract(epoch from (p_new_ends_at - v_booking.ends_at)) / 60)::int;

  -- Hour credits, soonest expiry first (same order as lib/hour-credits).
  if v_left > 0 then
    for v_credit in
      select id, hours_remaining from hour_credits
      where user_id = v_booking.user_id and active = true and hours_remaining > 0
        and (expires_at is null or expires_at > now())
      order by expires_at asc nulls last
      for update
    loop
      exit when v_left <= 0;
      v_take := least(v_credit.hours_remaining, v_left);
      update hour_credits set hours_remaining = hours_remaining - v_take where id = v_credit.id;
      insert into hour_credit_uses (hour_credit_id, booking_id, user_id, hours_used)
      values (v_credit.id, p_booking_id, v_booking.user_id, v_take);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 and p_strict then
      raise exception 'extend-credits-short: % hours not available', v_left;
    end if;
  end if;

  -- Gift card.
  if p_gift_card_id is not null and coalesce(p_gift_card_amount, 0) > 0 then
    select id, balance into v_gc from gift_cards where id = p_gift_card_id for update;
    if not found then
      if p_strict then raise exception 'extend-giftcard-missing'; end if;
    else
      v_gc_take := least(coalesce(v_gc.balance, 0), p_gift_card_amount);
      if v_gc_take < p_gift_card_amount and p_strict then
        raise exception 'extend-giftcard-short';
      end if;
      if v_gc_take > 0 then
        v_new_balance := v_gc.balance - v_gc_take;
        update gift_cards set balance = v_new_balance, active = v_new_balance > 0 where id = v_gc.id;
        insert into gift_card_transactions (gift_card_id, booking_id, amount, balance_after)
        values (v_gc.id, p_booking_id, -v_gc_take, v_new_balance);
      end if;
    end if;
  end if;

  update bookings
  set ends_at           = p_new_ends_at,
      extension_minutes = extension_minutes + v_added,
      extension_count   = extension_count + 1,
      extension_revenue = extension_revenue + coalesce(p_amount, 0),
      last_extended_at  = now()
  where id = p_booking_id;

  return query select true, v_added,
    (select b.extension_minutes from bookings b where b.id = p_booking_id),
    coalesce(p_credit_hours, 0) - greatest(v_left, 0), v_gc_take;
end;
$function$;

revoke all on function public.apply_booking_extension_with_credits(uuid, timestamptz, numeric, numeric, uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function public.apply_booking_extension_with_credits(uuid, timestamptz, numeric, numeric, uuid, numeric, boolean) to service_role;
