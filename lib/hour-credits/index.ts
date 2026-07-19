// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export interface AvailableCredit {
  id: string
  hours_remaining: number
  expires_at: string | null
}

/**
 * Fetch a user's usable hour credits (active, hours left, not expired),
 * ordered so the soonest-expiring credits are consumed first.
 */
export async function getAvailableHourCredits(
  client: SupabaseClient,
  userId: string
): Promise<AvailableCredit[]> {
  const nowIso = new Date().toISOString()
  const { data } = await client
    .from("hour_credits")
    .select("id, hours_remaining, expires_at")
    .eq("user_id", userId)
    .eq("active", true)
    .gt("hours_remaining", 0)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("expires_at", { ascending: true, nullsFirst: false })
  return (data ?? []) as AvailableCredit[]
}

export function sumCreditHours(credits: AvailableCredit[]): number {
  return credits.reduce((sum, c) => sum + Number(c.hours_remaining), 0)
}

/**
 * Deduct `hours` from the user's credits (soonest expiry first) and record
 * usage rows against the booking. Returns the hours actually consumed.
 * Mirrors the gift card pattern: read-modify-write via the service client.
 */
export async function consumeHourCredits(
  client: SupabaseClient,
  userId: string,
  bookingId: string,
  hours: number
): Promise<number> {
  if (hours <= 0) return 0

  // Idempotency guard: if usage rows already exist for this booking, do nothing.
  // Protects against Stripe webhook retries double-consuming.
  const { count: existing } = await client
    .from("hour_credit_uses")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
  if ((existing ?? 0) > 0) return 0

  const credits = await getAvailableHourCredits(client, userId)

  let remaining = hours
  let consumed = 0
  for (const credit of credits) {
    if (remaining <= 0) break
    const take = Math.min(Number(credit.hours_remaining), remaining)
    if (take <= 0) continue

    await client
      .from("hour_credits")
      .update({ hours_remaining: Number(credit.hours_remaining) - take })
      .eq("id", credit.id)

    await client.from("hour_credit_uses").insert({
      hour_credit_id: credit.id,
      booking_id: bookingId,
      user_id: userId,
      hours_used: take,
    })

    remaining -= take
    consumed += take
  }
  return consumed
}

/**
 * Return a cancelled booking's consumed hours to their source credits.
 * Restoration is recorded as negative usage rows for the audit trail.
 * Note: hours restored to an already-expired credit are effectively lost,
 * same as dollars refunded to an expired gift card would be.
 */
export async function restoreHourCredits(
  client: SupabaseClient,
  bookingId: string
): Promise<number> {
  const { data: uses } = await client
    .from("hour_credit_uses")
    .select("id, hour_credit_id, user_id, hours_used")
    .eq("booking_id", bookingId)

  const rows = (uses ?? []) as { id: string; hour_credit_id: string; user_id: string; hours_used: number }[]
  if (rows.length === 0) return 0
  // Already restored once (negative rows present): do nothing.
  if (rows.some((u) => Number(u.hours_used) < 0)) return 0

  let restored = 0
  for (const use of rows) {
    const hoursBack = Number(use.hours_used)
    if (hoursBack <= 0) continue

    const { data: credit } = await client
      .from("hour_credits")
      .select("hours_remaining")
      .eq("id", use.hour_credit_id)
      .single()
    if (!credit) continue

    await client
      .from("hour_credits")
      .update({ hours_remaining: Number(credit.hours_remaining) + hoursBack })
      .eq("id", use.hour_credit_id)

    await client.from("hour_credit_uses").insert({
      hour_credit_id: use.hour_credit_id,
      booking_id: bookingId,
      user_id: use.user_id,
      hours_used: -hoursBack,
    })

    restored += hoursBack
  }
  return restored
}

/**
 * Re-point a booking's credit usage rows at a new booking (reschedule flow),
 * so a later cancellation of the new booking restores the right hours.
 */
export async function moveHourCreditUses(
  client: SupabaseClient,
  fromBookingId: string,
  toBookingId: string
): Promise<void> {
  await client
    .from("hour_credit_uses")
    .update({ booking_id: toBookingId })
    .eq("booking_id", fromBookingId)
}
