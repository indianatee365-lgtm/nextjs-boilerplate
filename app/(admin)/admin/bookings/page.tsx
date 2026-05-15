import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingsManager from "./BookingsManager"

export const metadata = { title: "Manage Bookings | Tee365 Admin" }

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "admin") redirect("/account")

  const params = await searchParams
  const pendingMode = params.status === "pending"
  const dateStr = params.date ?? new Date().toISOString().split("T")[0]

  const { data: bays } = await supabase
    .from("bays")
    .select("id, number, name")
    .eq("active", true)
    .order("number")

  let bookings
  if (pendingMode) {
    const { data } = await supabase
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
    const { data } = await supabase
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
