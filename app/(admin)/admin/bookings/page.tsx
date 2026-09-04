import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingsManager from "./BookingsManager"
import MonthCalendar from "./MonthCalendar"

export const metadata = { title: "Manage Bookings | Tee365 Admin" }

// Vercel's server runs in UTC, so a bare `${dateStr}T00:00:00` parses as UTC
// midnight, not Eastern midnight - anything booked between 8pm and midnight
// Eastern was landing in the NEXT day's query window. The offset is looked
// up for the specific date being queried (via a noon-UTC anchor, safely
// inside the same Eastern calendar day either side of DST) rather than
// hardcoded, so this stays correct across the DST changeover instead of
// only working for whichever offset happens to be active right now.
function easternDayBoundsUtc(dateStr: string): { start: Date; end: Date } {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`)
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    timeZoneName: "shortOffset",
  }).formatToParts(noonUtc).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5"
  const offsetHours = parseInt(offsetPart.replace("GMT", ""), 10) || -5
  const offsetStr = `${offsetHours >= 0 ? "+" : "-"}${String(Math.abs(offsetHours)).padStart(2, "0")}:00`
  const start = new Date(`${dateStr}T00:00:00${offsetStr}`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

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
  // Eastern, not UTC - the server runs in UTC, so a naive toISOString()
  // rolls "today" over to tomorrow's date as soon as it hits 8pm Eastern,
  // silently defaulting the whole page (and the day-view query below) to
  // the wrong calendar day for the rest of the evening. Confirmed live
  // 2026-08-29 ~10:40pm ET: an 11pm booking (tonight) was showing up under
  // tomorrow's date.
  const dateStr = params.date ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" })
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
      .select("starts_at, status, total, paid_at, gift_card_applied, refund_amount")
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
  let blockedTimes: { id: string; bay_id: string | null; starts_at: string; ends_at: string; reason: string | null }[] = []
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
    const { start, end } = easternDayBoundsUtc(dateStr)
    const { data } = await serviceClient
      .from("bookings")
      .select(`
        id, starts_at, ends_at, status, total, duration_minutes,
        access_code, notes, cancelled_at, refund_amount,
        created_at, stripe_payment_intent_id,
        subtotal, membership_discount, coupon_discount, tax,
        gift_card_applied, credit_hours_applied, credit_discount, paid_at,
        bays(id, name, number),
        profiles!user_id(id, first_name, last_name, phone)
      `)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at")
    bookings = data

    // Overlap, not containment - a block created for e.g. 11pm-1am should
    // still show up on both calendar days it actually covers, not just the
    // one its starts_at happens to fall on.
    const { data: blocks } = await serviceClient
      .from("blocked_times")
      .select("id, bay_id, starts_at, ends_at, reason")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .order("starts_at")
    blockedTimes = blocks ?? []
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
        blockedTimes={blockedTimes}
        selectedDate={dateStr}
        pendingMode={pendingMode}
      />
    </main>
  )
}
