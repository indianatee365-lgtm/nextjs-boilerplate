import { createClient, createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import ExtendFlow from "./ExtendFlow"

export const metadata = { title: "Extend Your Session | Tee365" }

// Reached by scanning the QR code the bay PC's kiosk agent shows in the last
// 15 minutes of a session (see /api/bay-agent/sync's showExtendPrompt), so
// this has to work from a phone with no logged-in tee365.org session - auth
// is the booking's extend_token in the query string, or a session if the
// customer happens to be logged in on that device. Same dual-auth as
// /api/bookings/extend and finalizeExtend.
export default async function ExtendPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<{ token?: string; extended?: string; error?: string }>
}) {
  const { bookingId } = await params
  const { token, extended, error } = await searchParams

  const serviceClient = await createServiceClient()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, starts_at, ends_at, extend_token, bays(name)")
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
  const ended = booking.status !== "confirmed" || new Date(booking.ends_at) <= new Date()

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold text-white mb-2">Extend Your Session</h1>
      <p className="text-sm text-neutral-400 mb-6">
        {bay?.name} · ends at{" "}
        {new Date(booking.ends_at).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
        })}
      </p>

      {extended === "1" && (
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
          <p className="font-semibold text-green-400">Session extended</p>
          <p className="mt-1 text-sm text-neutral-300">Enjoy your round.</p>
        </div>
      )}
      {error === "payment" && (
        <p className="mb-4 text-sm text-red-400">Payment wasn&apos;t completed. Please try again.</p>
      )}
      {error === "finalize" && (
        <p className="mb-4 text-sm text-red-400">
          Your card was charged but we couldn&apos;t apply the extension. Please tell staff or contact info@tee365.org — we&apos;ll sort it out.
        </p>
      )}

      {ended ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-sm text-neutral-300">
            This session has already ended. Head to{" "}
            <a href="https://tee365.org/book" className="underline hover:text-white">tee365.org/book</a>{" "}
            to book another round, or ask staff for help.
          </p>
        </div>
      ) : extended === "1" ? null : (
        <ExtendFlow bookingId={booking.id} token={token} currentEndsAt={booking.ends_at} />
      )}
    </main>
  )
}
