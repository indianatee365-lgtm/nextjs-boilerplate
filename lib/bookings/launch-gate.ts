// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// All boundaries in America/Indiana/Indianapolis (EDT, UTC-4 in August),
// matching the convention already used for the Founders Day hour_credits
// expires_at in the Stripe webhook.
export const FOUNDERS_DAY_START = new Date("2026-08-29T04:00:00Z")
const FOUNDERS_DAY_END = new Date("2026-08-30T03:59:59Z")
const FOUNDERS_DAY_BOOKING_OPENS = new Date("2026-08-18T04:00:00Z")

// Founder's Club sales close 8/19 00:01 EDT. From that moment, any active
// founder (not just those with a Founders Day hour credit) can book any
// bay/date starting 8/29 (Founders Day itself) - a 10-day head start on
// the 8/30 public opening day.
export const FOUNDERS_CLUB_DEADLINE = new Date("2026-08-19T04:01:00Z") // 00:01 ET Aug 19
const FOUNDER_EARLIEST_BOOKABLE_START = new Date("2026-08-29T04:00:00Z") // midnight ET Aug 29, Founders Day itself
const PUBLIC_EARLIEST_BOOKABLE_START = new Date("2026-08-30T04:00:00Z") // midnight ET Aug 30, public opening day

// Birdie/Eagle memberships go on sale 8/23 (Sunday) - also the day the
// general public's own 7-day advance booking window opens, ahead of the
// 8/30 public opening.
export const BIRDIE_EAGLE_LAUNCH = new Date("2026-08-23T04:00:00Z") // midnight ET Aug 23
export const PUBLIC_BOOKING_OPENS = new Date("2026-08-23T04:00:00Z") // midnight ET Aug 23

export function isFoundersDaySession(startsAt: string | Date): boolean {
  const d = new Date(startsAt)
  return d.getTime() >= FOUNDERS_DAY_START.getTime() && d.getTime() <= FOUNDERS_DAY_END.getTime()
}

// A founder can reserve their Friends & Founders Day slot starting 8/18,
// ahead of general public opening, using the real hour_credits row the
// Stripe webhook (or the one-time backfill) issued them - tagged
// "Founders Day 2026" so this doesn't accidentally unlock early access for
// someone holding an unrelated hour credit (a raffle prize, etc).
// Deliberately does NOT check current membership/billing status - these
// free hours were earned at signup and stay redeemable even if a renewal
// payment happens to be past due around Founders Day itself.
export async function hasFoundersDayCredit(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  if (Date.now() < FOUNDERS_DAY_BOOKING_OPENS.getTime()) return false

  const { data } = await serviceClient
    .from("hour_credits")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", "Founders Day 2026")
    .eq("active", true)
    .gt("hours_remaining", 0)
    .limit(1)
    .maybeSingle()

  return !!data
}

// General early-access booking window: any active founder can book any
// session starting 8/29 (Founders Day itself) or later, once the window
// opens 8/19 00:01 EDT - a rolling 21-day-from-today cap (enforced
// separately in create.ts) means day one reaches through 9/9, growing by a
// day each day after. Separate from the Founders Day credit above - this is
// a membership-status check, not a redeemable-credit check, so it also
// covers founders booking ordinary paid time on 8/29 itself.
export function isEarlyAccessEligibleSession(startsAt: string | Date): boolean {
  const d = new Date(startsAt)
  return Date.now() >= FOUNDERS_CLUB_DEADLINE.getTime()
    && d.getTime() >= FOUNDER_EARLIEST_BOOKABLE_START.getTime()
}

// The one shared code Jerrod hands out to non-founder guests for Friends &
// Founders Day (8/29) - a $50 fixed-amount coupon (covers even the
// priciest in-season weekend slot) capped to one use per account via
// coupons.max_uses_per_user, with no total-use cap since it's meant to be
// forwarded freely. Checking the literal string here is just the page-gate
// admission check - the coupon's own active/expired/max-uses/already-used
// rules are enforced for real at checkout the same way any other coupon is,
// so a stale or tampered code can get someone PAST this gate but never
// actually grants a discount or lets the booking through in create.ts.
export const FRIENDS_DAY_COUPON_CODE = "FRIENDSDAY"

// Mirrors hasFoundersDayCredit's shape, but for a coupon instead of an
// hour_credits row - a friend isn't a founder and shouldn't be represented
// as one, so this is deliberately a separate check rather than reusing or
// generalizing the founder credit path.
export async function hasUnusedFriendsDayCoupon(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  const { data: coupon } = await serviceClient
    .from("coupons")
    .select("id, max_uses, uses_count, expires_at, active")
    .eq("code", FRIENDS_DAY_COUPON_CODE)
    .eq("active", true)
    .maybeSingle()

  if (!coupon) return false
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return false
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) return false

  const { count } = await serviceClient
    .from("coupon_uses")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", coupon.id)
    .eq("user_id", userId)

  return (count ?? 0) === 0
}

export async function isActiveFounder(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await serviceClient
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_type", "founder")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  return !!data
}

// General public booking window: anyone can book any session starting 8/30
// or later, once booking opens 8/23 - a 7-day advance window ahead of the
// 8/30 public opening day. No membership/credit check - this is the
// catch-all path everyone eventually falls into.
export function isPublicBookingOpen(startsAt: string | Date): boolean {
  const d = new Date(startsAt)
  return Date.now() >= PUBLIC_BOOKING_OPENS.getTime()
    && d.getTime() >= PUBLIC_EARLIEST_BOOKABLE_START.getTime()
}
