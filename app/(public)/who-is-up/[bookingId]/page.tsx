import { createClient, createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import WhoIsUpFlow from "./WhoIsUpFlow"
import WhoIsHittingFlow from "./WhoIsHittingFlow"

export const metadata = { title: "Who's Playing? | Tee365" }

// Reached by scanning the QR code the bay PC's kiosk agent shows at the start
// of a session (see /api/bay-agent/sync's showWhoIsUpPrompt) - phone-only
// flow, same dual-auth as /extend: the booking's extend_token in the query
// string, or a logged-in session belonging to the booking's own user.
export default async function WhoIsUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { bookingId } = await params
  const { token } = await searchParams

  const serviceClient = await createServiceClient()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, ends_at, extend_token, roster_confirmed_at, roster_names, current_hitter, bays(name), profiles!user_id(first_name)")
    .eq("id", bookingId)
    .single()

  if (!booking) notFound()

  let authorized = Boolean(token && booking.extend_token && token === booking.extend_token)
  if (!authorized) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    authorized = Boolean(user && user.id === booking.user_id)
  }
  if (!authorized) notFound()

  const bay = booking.bays as { name: string } | null
  const profile = booking.profiles as { first_name: string } | null
  const bookerName = profile?.first_name ?? "there"
  const ended = booking.status !== "confirmed" || new Date(booking.ends_at) <= new Date()

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      {(ended || booking.roster_confirmed_at) && (
        <>
          <h1 className="text-2xl font-semibold text-white mb-2">Who&apos;s Playing?</h1>
          <p className="text-sm text-neutral-400 mb-6">{bay?.name}</p>
        </>
      )}

      {ended ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-sm text-neutral-300">This session has already ended.</p>
        </div>
      ) : !booking.roster_confirmed_at ? (
        <WhoIsUpFlow bookingId={booking.id} token={token} bookerName={bookerName} bayName={bay?.name ?? ""} />
      ) : booking.roster_names && booking.roster_names.length > 0 ? (
        <WhoIsHittingFlow
          bookingId={booking.id}
          token={token}
          names={booking.roster_names}
          initialHitter={booking.current_hitter}
        />
      ) : (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
          <p className="font-semibold text-green-400">You&apos;re all set</p>
          <p className="mt-1 text-sm text-neutral-300">Go hit it.</p>
        </div>
      )}
    </main>
  )
}
