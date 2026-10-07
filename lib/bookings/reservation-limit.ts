import { holdsBayFilter } from "@/lib/bookings/pending-hold"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * How many upcoming bookings a customer can hold at once, counted by time
 * slot: two bays at the same start time are one reservation. Decided
 * 2026-10-07. Members get membership_plans.max_active_reservations, everyone
 * else gets NON_MEMBER_RESERVATION_LIMIT.
 *
 * This is the early check, so the customer is told before any payment starts.
 * The database trigger bookings_reservation_limit enforces the same rules and
 * is what holds when two requests arrive at once. Grounds Crew bookings and
 * admin-made bookings are exempt in both places.
 */
export const NON_MEMBER_RESERVATION_LIMIT = 1
export const MAX_BAYS_PER_SLOT = 2

const BAY_LIMIT_MESSAGE =
  `You can book up to ${MAX_BAYS_PER_SLOT} bays for the same time online. For a bigger group, email info@tee365.org and we'll set it up.`

export async function checkReservationLimit(
  db: SupabaseClient,
  {
    userId,
    startsAt,
    slotLimit,
    planName,
    bays = 1,
  }: {
    userId: string
    startsAt: Date
    slotLimit: number
    planName: string | null
    /** Bays this request adds to the slot: 2 for a two-bay booking. */
    bays?: number
  },
): Promise<string | null> {
  const { data } = await db
    .from("bookings")
    .select("starts_at")
    .eq("user_id", userId)
    .eq("grounds_crew_minutes", 0)
    .or(holdsBayFilter())
    .gt("ends_at", new Date().toISOString())
  const starts = ((data ?? []) as { starts_at: string }[]).map((b) => new Date(b.starts_at).getTime())

  const sameSlot = starts.filter((t) => t === startsAt.getTime()).length
  if (sameSlot + bays > MAX_BAYS_PER_SLOT) return BAY_LIMIT_MESSAGE
  if (sameSlot > 0) return null

  if (new Set(starts).size < slotLimit) return null
  return planName
    ? `Your ${planName} membership holds up to ${slotLimit} upcoming booking${slotLimit === 1 ? "" : "s"} at a time. Once one of them is over you can book another.`
    : `You can hold ${slotLimit} upcoming booking at a time. Once that session is over you can book the next one, and members can hold more.`
}

/** The trigger's error messages, mapped to what the customer reads. */
export function reservationLimitErrorMessage(dbMessage: string | undefined | null): string | null {
  if (!dbMessage) return null
  if (dbMessage.includes("RESERVATION_SLOT_BAY_LIMIT")) return BAY_LIMIT_MESSAGE
  if (dbMessage.includes("RESERVATION_LIMIT")) {
    return "You've reached the limit on upcoming bookings for your account. Once one of them is over you can book another."
  }
  return null
}
