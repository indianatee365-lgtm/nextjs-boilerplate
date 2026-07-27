// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// All boundaries in America/Indiana/Indianapolis (EDT, UTC-4 in August),
// matching the convention already used for the Founders Day hour_credits
// expires_at in the Stripe webhook.
const FOUNDERS_DAY_START = new Date("2026-08-29T04:00:00Z")
const FOUNDERS_DAY_END = new Date("2026-08-30T03:59:59Z")
const FOUNDERS_DAY_BOOKING_OPENS = new Date("2026-08-18T04:00:00Z")

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
