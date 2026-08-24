"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

// Shared by both actions below - a customer scanning this on a shared phone
// doesn't need an account, so auth is the same dual-token/session check as
// /extend's finalizeExtend: the booking's own extend_token in the URL, or a
// logged-in session belonging to the booking's user.
async function authorizeBooking(serviceClient: ServiceClient, bookingId: string, token: string | undefined) {
  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, extend_token")
    .eq("id", bookingId)
    .single()

  if (!booking) throw new Error("Booking not found")

  let authorized = Boolean(token && booking.extend_token && token === booking.extend_token)
  if (!authorized) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    authorized = Boolean(user && user.id === booking.user_id)
  }
  if (!authorized) throw new Error("Unauthorized")
  if (booking.status !== "confirmed") throw new Error("Booking is no longer active")

  return booking
}

// Confirms roster once per booking. Empty names array means "just me, solo"
// (the phone flow's own quick button), stored as roster_confirmed_at with no
// names rather than a special-cased flag - the companion side only ever
// checks whether roster_confirmed_at is set, it doesn't care why. Defaults
// current_hitter to the first name entered so there's always a sane starting
// selection for the group to switch off of on the next screen.
export async function confirmRoster({
  bookingId,
  token,
  names,
}: {
  bookingId: string
  token?: string
  names: string[]
}): Promise<{ ok: true }> {
  const serviceClient = await createServiceClient()
  await authorizeBooking(serviceClient, bookingId, token)

  const cleanNames = names.map((n) => n.trim()).filter(Boolean).slice(0, 6)

  const { error } = await serviceClient
    .from("bookings")
    .update({
      roster_confirmed_at: new Date().toISOString(),
      roster_names: cleanNames.length > 0 ? cleanNames : null,
      current_hitter: cleanNames.length > 0 ? cleanNames[0] : null,
    })
    .eq("id", bookingId)

  if (error) throw new Error("Failed to save")

  await logEvent(serviceClient, "booking-roster-confirmed", `booking=${bookingId} players=${cleanNames.length || "solo"}`)

  return { ok: true }
}

// Switches whose turn it is - callable repeatedly for the rest of the
// session, unlike confirmRoster which only ever runs once. No shot-capture
// pipeline reads this yet (that's separate, unbuilt work), but the group
// needs to be able to say who's up regardless of whether anything downstream
// is listening yet.
export async function setCurrentHitter({
  bookingId,
  token,
  name,
}: {
  bookingId: string
  token?: string
  name: string
}): Promise<{ ok: true }> {
  const serviceClient = await createServiceClient()
  await authorizeBooking(serviceClient, bookingId, token)

  const { error } = await serviceClient
    .from("bookings")
    .update({ current_hitter: name })
    .eq("id", bookingId)

  if (error) throw new Error("Failed to save")

  return { ok: true }
}
