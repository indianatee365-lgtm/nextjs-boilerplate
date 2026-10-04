// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Bay names this customer STILL holds, confirmed, overlapping [startsAt, endsAt).
 *
 * Every path that tells a customer "that time slot has been released" needs
 * this. Added 2026-10-04 after a customer who had accidentally held the same
 * slot three times got that message for a session he had in fact booked
 * successfully, could not reconcile the two, and phoned in. The message was
 * true but incomplete.
 *
 * The answer is to add information, never to withhold the message: if someone
 * books two bays deliberately and payment fails on one, that is precisely when
 * they must hear about it, or they turn up for a group with half the bays. What
 * they need to know is WHICH bay is still theirs.
 *
 * Overlap is half-open to match the bookings_no_overlap EXCLUDE constraint, so
 * a booking that merely starts when this one ends does not count as the same
 * time. Returns [] on any failure: a missing reassurance line is a far better
 * outcome than a swallowed notification.
 */
export async function getStillConfirmedBayNames(
  supabase: SupabaseClient,
  userId: string,
  startsAt: string,
  endsAt: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("bookings")
      .select("bays(name)")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
    return ((data ?? []) as { bays: { name: string } | null }[])
      .map((r) => r.bays?.name)
      .filter((n): n is string => Boolean(n))
  } catch {
    return []
  }
}
