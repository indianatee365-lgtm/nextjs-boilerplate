// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// All boundaries in America/Indiana/Indianapolis (EDT, UTC-4 in August),
// matching the convention already used for the Founders Day hour_credits
// expires_at in the Stripe webhook.
const FOUNDERS_DAY_START = new Date("2026-08-29T04:00:00Z")
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
// someone holding an unrelated hour credit (a raffle prize, etc). The
// hour_credits row itself is never touched by billing status changes
// (granted once at signup, no expiry by design), so this also requires the
// membership to be currently active - a past_due or cancelled founder
// keeps the credit row in the DB but can't redeem it until they're current.
export async function hasFoundersDayCredit(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  if (Date.now() < FOUNDERS_DAY_BOOKING_OPENS.getTime()) return false
  if (!(await isActiveFounder(serviceClient, userId))) return false

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
