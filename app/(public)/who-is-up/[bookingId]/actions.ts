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

// Confirms roster once per booking. Empty players array means "just me, solo"
// (the phone flow's own quick button), stored as roster_confirmed_at with no
// names rather than a special-cased flag - the companion side only ever
// checks whether roster_confirmed_at is set, it doesn't care why. Defaults
// current_hitter to the first name entered so there's always a sane starting
// selection for the group to switch off of on the next screen.
//
// Account linking (Jerrod's ask 2026-08-24): a player can optionally supply
// an email. If it matches an existing Tee365 account, that name is recorded
// in roster_links (name -> user_id) so the shot-capture pipeline attributes
// their shots to THEIR OWN account instead of the booker's - e.g. a founder
// books and adds his daughter, her rounds show up under her own login, not
// his. Same admin.listUsers()-and-match-by-email lookup already used by
// grantHoursByEmail - no separate email index exists, this is a small
// enough user base that a full listing per lookup is fine. Best-effort: an
// email with no match doesn't block saving the roster, it's just reported
// back so the customer can fix a typo or shrug and continue (that name
// falls back to the booker's own account for storage, same as any
// unlinked name).
export async function confirmRoster({
  bookingId,
  token,
  players,
}: {
  bookingId: string
  token?: string
  players: { name: string; email?: string }[]
}): Promise<{ ok: true; notFoundEmails: string[] }> {
  const serviceClient = await createServiceClient()
  await authorizeBooking(serviceClient, bookingId, token)

  const cleanPlayers = players
    .map((p) => ({ name: p.name.trim(), email: (p.email ?? "").trim().toLowerCase() }))
    .filter((p) => p.name)
    .slice(0, 6)

  const notFoundEmails: string[] = []
  const rosterLinks: Record<string, string> = {}
  const emailsToLookUp = cleanPlayers.filter((p) => p.email)

  if (emailsToLookUp.length > 0) {
    const { data: usersPage, error: listError } =
      await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) throw new Error("Failed to look up accounts")

    for (const p of emailsToLookUp) {
      const match = usersPage.users.find((u: { email?: string }) => u.email?.toLowerCase() === p.email)
      if (match) {
        rosterLinks[p.name] = match.id
      } else {
        notFoundEmails.push(p.email)
      }
    }
  }

  const cleanNames = cleanPlayers.map((p) => p.name)

  const { error } = await serviceClient
    .from("bookings")
    .update({
      roster_confirmed_at: new Date().toISOString(),
      roster_names: cleanNames.length > 0 ? cleanNames : null,
      roster_links: Object.keys(rosterLinks).length > 0 ? rosterLinks : null,
      current_hitter: cleanNames.length > 0 ? cleanNames[0] : null,
    })
    .eq("id", bookingId)

  if (error) throw new Error("Failed to save")

  await logEvent(
    serviceClient,
    "booking-roster-confirmed",
    `booking=${bookingId} players=${cleanNames.length || "solo"} linked=${Object.keys(rosterLinks).length}`,
  )

  return { ok: true, notFoundEmails }
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
