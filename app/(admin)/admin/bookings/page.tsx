import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingsManager from "./BookingsManager"

export const metadata = { title: "Manage Bookings | Tee365 Admin" }

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
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
  const dateStr = params.date ?? new Date().toISOString().split("T")[0]
  const date = new Date(`${dateStr}T00:00:00`)
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)

  const { data: bookings } = await serviceClient
    .from("bookings")
    .select(`
      id, starts_at, ends_at, status, total, duration_minutes,
      access_code, notes, cancelled_at, refund_amount,
      bays(id, name, number),
      profiles!user_id(id, first_name, last_name, phone)
    `)
    .gte("starts_at", date.toISOString())
    .lt("starts_at", nextDay.toISOString())
    .order("starts_at")

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
      />
    </main>
  )
}
