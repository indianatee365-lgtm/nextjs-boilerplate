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
// bay/date starting 8/30 - the day after Friends & Founders Day - ahead of
// the 9/1 general public launch.
const FOUNDERS_EARLY_ACCESS_OPENS = new Date("2026-08-19T04:01:00Z")
const EARLY_ACCESS_MIN_SESSION_START = new Date("2026-08-30T04:00:00Z")

export function isFoundersDaySession(startsAt: string | Date): boolean {
  const d = new Date(startsAt)
  return d.getTime() >= FOUNDERS_DAY_START.getTime() && d.getTime() <= FOUNDERS_DAY_END.getTime()
}

// A founder can reserve their Friends & Founders Day slot starting 8/18,
// ahead of general public opening, using the real hour_credits row the
// Stripe webhook (or the one-time backfill) issued them - tagged
// "Founders Day 2026" so this doesn't accidentally unlock early access for
// someone holding an unrelated hour credit (a raffle prize, etc).
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
// session starting 8/30 or later, once the window opens 8/19 00:01 EDT.
// Separate from the Founders Day credit above - this is a membership-status
// check, not a redeemable-credit check.
export function isEarlyAccessEligibleSession(startsAt: string | Date): boolean {
  const d = new Date(startsAt)
  return Date.now() >= FOUNDERS_EARLY_ACCESS_OPENS.getTime()
    && d.getTime() >= EARLY_ACCESS_MIN_SESSION_START.getTime()
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
