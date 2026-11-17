import { DOOR_OPENS_EARLY_MINUTES } from "@/lib/access-control/constants"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// Back-to-back bookings on one bay (2026-11-13). On the busiest day since
// September a dad was still in the bay with an upset kid when the next group
// walked in at their start time: the bay screen had shown its usual "scan to
// extend" countdown, which offered more time that could not exist and never
// said anyone was coming. Nobody's paid time is shortened to fix this. The
// current group gets a clear, early heads-up and the next group is told to
// wait for their start time.
//
// Another customer counts as "right after" when their booking starts within
// the window the door opens early, since that is when they can already be
// standing in the room. A customer who booked the next slot themselves is
// not a handoff.
export const HANDOFF_WINDOW_MINUTES = DOOR_OPENS_EARLY_MINUTES

const windowMs = HANDOFF_WINDOW_MINUTES * 60 * 1000

/** When a different customer's booking on this bay starts right after `endsAt`, or null. */
export async function nextGroupStartsAt(
  supabase: SupabaseClient,
  bayId: string,
  userId: string,
  endsAt: Date,
): Promise<Date | null> {
  const { data } = await supabase
    .from("bookings")
    .select("starts_at")
    .eq("bay_id", bayId)
    .eq("status", "confirmed")
    .neq("user_id", userId)
    .gte("starts_at", endsAt.toISOString())
    .lte("starts_at", new Date(endsAt.getTime() + windowMs).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.starts_at ? new Date(data.starts_at) : null
}

/** When a different customer's booking on this bay ends right before `startsAt`, or null. */
export async function previousGroupEndsAt(
  supabase: SupabaseClient,
  bayId: string,
  userId: string,
  startsAt: Date,
): Promise<Date | null> {
  const { data } = await supabase
    .from("bookings")
    .select("ends_at")
    .eq("bay_id", bayId)
    .eq("status", "confirmed")
    .neq("user_id", userId)
    .lt("starts_at", startsAt.toISOString())
    .gt("ends_at", new Date(startsAt.getTime() - windowMs).toISOString())
    .lte("ends_at", startsAt.toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.ends_at ? new Date(data.ends_at) : null
}
