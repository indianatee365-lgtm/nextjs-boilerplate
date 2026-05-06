import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import RescheduleFlow from "./RescheduleFlow"

export const metadata = { title: "Reschedule Booking | Tee365" }

export default async function ReschedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, starts_at, ends_at, duration_minutes, total, bays(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!booking) notFound()

  if (booking.status === "cancelled") redirect("/account/bookings")

  const hoursUntil = (new Date(booking.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
  const tooClose = hoursUntil <= 4

  const { data: membership } = await supabase
    .from("memberships")
    .select("membership_plans(advance_booking_days)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  const advanceDays = (membership?.membership_plans as { advance_booking_days: number } | null)?.advance_booking_days ?? 7

  const bay = booking.bays as { name: string } | null

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/account/bookings" className="text-sm text-neutral-400 hover:text-white">← My Bookings</Link>
        <h1 className="text-2xl font-semibold text-white">Reschedule Booking</h1>
      </div>

      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
        <p className="text-sm text-neutral-400">Current booking</p>
        <p className="font-semibold text-white mt-1">{bay?.name}</p>
        <p className="text-sm text-neutral-400">
          {new Date(booking.starts_at).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            timeZone: "America/Indiana/Indianapolis",
          })}
          {" · "}
          {new Date(booking.starts_at).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
          })}
          {" – "}
          {new Date(booking.ends_at).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
          })}
        </p>
      </div>

      {tooClose ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="font-semibold text-red-400">Cannot reschedule</p>
          <p className="mt-1 text-sm text-neutral-300">
            Per our <Link href="/terms" className="underline hover:text-white">reschedule policy</Link>,
            bookings cannot be rescheduled within 4 hours of the session.
            Contact us at <a href="mailto:info@tee365.org" className="underline hover:text-white">info@tee365.org</a> if you need help.
          </p>
        </div>
      ) : (
        <RescheduleFlow
          bookingId={booking.id}
          originalTotal={Number(booking.total)}
          durationMinutes={booking.duration_minutes}
          advanceDays={advanceDays}
        />
      )}
    </main>
  )
}
