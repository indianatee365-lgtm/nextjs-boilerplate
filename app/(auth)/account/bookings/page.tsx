import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { CancelBookingButton } from "./CancelBookingButton"

export const metadata = { title: "My Bookings | Tee365" }

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; rescheduled?: string; reschedule_error?: string }>
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { confirmed, rescheduled, reschedule_error } = await searchParams

  const { data: bookings } = await serviceClient
    .from("bookings")
    .select("id, starts_at, ends_at, duration_minutes, status, total, access_code, bays(name)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: false })
    .limit(50)

  const now = new Date()
  const upcoming = (bookings ?? []).filter((b) => new Date(b.starts_at) >= now && b.status !== "cancelled")
  const past = (bookings ?? []).filter((b) => new Date(b.starts_at) < now || b.status === "cancelled")

  function BookingCard({ b, isUpcoming }: { b: typeof bookings extends (infer T)[] | null ? T : never; isUpcoming: boolean }) {
    const bay = b.bays as { name: string } | null
    const start = new Date(b.starts_at)
    const end = new Date(b.ends_at)
    const isCancelled = b.status === "cancelled"

    return (
      <div className={`rounded-xl border bg-white/5 px-4 py-4 ${isCancelled ? "border-white/5 opacity-50" : "border-white/10"}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-white">{bay?.name ?? "Bay"}</p>
            <p className="mt-0.5 text-sm text-neutral-400">
              {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}
              {" · "}
              {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
              {" – "}
              {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-white">${Number(b.total).toFixed(2)}</p>
            <p className={`mt-0.5 text-xs capitalize ${
              b.status === "confirmed" ? "text-green-400" :
              b.status === "pending" ? "text-yellow-400" :
              "text-neutral-500"
            }`}>{b.status}</p>
          </div>
        </div>
        {b.access_code && !isCancelled && (
          <div className="mt-3 rounded-lg bg-black/30 px-3 py-2">
            <p className="text-xs text-neutral-500">Access code</p>
            <p className="mt-0.5 text-xl font-bold tracking-widest text-brand">{b.access_code}</p>
          </div>
        )}
        {isUpcoming && !isCancelled && (
          <div className="mt-3 flex items-center justify-between">
            <Link href={`/account/bookings/${b.id}/reschedule`} className="text-xs text-neutral-500 hover:text-white underline transition-colors">
              Reschedule
            </Link>
            <CancelBookingButton bookingId={b.id} startsAt={b.starts_at} total={Number(b.total)} />
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/account" className="text-sm text-neutral-400 hover:text-white">← Account</Link>
        <h1 className="text-2xl font-semibold text-white">My Bookings</h1>
      </div>

      {confirmed && (
        <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
          <p className="font-semibold text-green-400">Booking confirmed!</p>
          <p className="mt-0.5 text-sm text-neutral-300">
            Your access code will appear below once payment clears. Check your phone for an SMS confirmation.
          </p>
        </div>
      )}

      {rescheduled && (
        <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
          <p className="font-semibold text-green-400">Booking rescheduled!</p>
          <p className="mt-0.5 text-sm text-neutral-300">
            Your booking has been moved. A confirmation has been sent to your phone and email.
          </p>
        </div>
      )}

      {reschedule_error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="font-semibold text-red-400">Reschedule incomplete</p>
          <p className="mt-0.5 text-sm text-neutral-300">
            Something went wrong finalizing your reschedule. Please contact us at{" "}
            <a href="mailto:info@tee365.org" className="underline hover:text-white">info@tee365.org</a>.
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-white">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((b) => <BookingCard key={b.id} b={b} isUpcoming={true} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Past</h2>
          <div className="space-y-3">
            {past.map((b) => <BookingCard key={b.id} b={b} isUpcoming={false} />)}
          </div>
        </section>
      )}

      {!bookings?.length && (
        <p className="text-sm text-neutral-500">No bookings yet. <Link href="/book" className="text-brand hover:underline">Book a bay →</Link></p>
      )}
    </main>
  )
}
