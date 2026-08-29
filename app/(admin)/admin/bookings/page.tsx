import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingsManager from "./BookingsManager"
import MonthCalendar from "./MonthCalendar"

export const metadata = { title: "Manage Bookings | Tee365 Admin" }

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; view?: string }>
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "admin") redirect("/account")

  const params = await searchParams
  const pendingMode = params.status === "pending"
  const dateStr = params.date ?? new Date().toISOString().split("T")[0]
  // Defaults to month now (Jerrod's call 2026-08-29) - day was the original
  // default before month view existed. An explicit ?view=day (used by the
  // month grid's own "Day view" button and clicking into a day) still wins.
  const view = params.view === "day" ? "day" : "month"

  if (view === "month" && !pendingMode) {
    const anchor = new Date(`${dateStr}T00:00:00`)
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    const { data: monthBookings } = await serviceClient
      .from("bookings")
      .select("starts_at, status")
      .gte("starts_at", monthStart.toISOString())
      .lt("starts_at", monthEnd.toISOString())

    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-white">Manage Bookings</h1>
        <MonthCalendar bookings={monthBookings ?? []} selectedDate={dateStr} />
      </main>
    )
  }

  let bookings
  if (pendingMode) {
    const { data } = await serviceClient
      .from("bookings")
      .select(`
        id, starts_at, ends_at, status, total, duration_minutes,
        access_code, notes, cancelled_at, refund_amount,
        created_at, stripe_payment_intent_id,
        bays(id, name, number),
        profiles!user_id(id, first_name, last_name, phone)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    bookings = data
  } else {
    const date = new Date(`${dateStr}T00:00:00`)
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    const { data } = await serviceClient
      .from("bookings")
      .select(`
        id, starts_at, ends_at, status, total, duration_minutes,
        access_code, notes, cancelled_at, refund_amount,
        created_at, stripe_payment_intent_id,
        bays(id, name, number),
        profiles!user_id(id, first_name, last_name, phone)
      `)
      .gte("starts_at", date.toISOString())
      .lt("starts_at", nextDay.toISOString())
      .order("starts_at")
    bookings = data
  }

  const { data: bays } = await serviceClient
    .from("bays")
    .select("id, number, name")
    .eq("active", true)
    .order("number")

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Manage Bookings</h1>
      <BookingsManager
        bookings={bookings ?? []}
        bays={bays ?? []}
        selectedDate={dateStr}
        pendingMode={pendingMode}
      />
    </main>
  )
}
