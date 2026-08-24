"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

// Confirms roster once per booking - a customer scanning this on a shared
// phone doesn't need an account, so auth is the same dual-token/session check
// as /extend's finalizeExtend. Empty names array means "just me, solo" (the
// phone flow's own quick button), stored as roster_confirmed_at with no names
// rather than a special-cased flag, since the companion side only ever checks
// whether roster_confirmed_at is set - it doesn't care why.
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

  const cleanNames = names.map((n) => n.trim()).filter(Boolean).slice(0, 6)

  const { error } = await serviceClient
    .from("bookings")
    .update({
      roster_confirmed_at: new Date().toISOString(),
      roster_names: cleanNames.length > 0 ? cleanNames : null,
    })
    .eq("id", bookingId)

  if (error) throw new Error("Failed to save")

  await logEvent(serviceClient, "booking-roster-confirmed", `booking=${bookingId} players=${cleanNames.length || "solo"}`)

  return { ok: true }
}
