import { createServiceClient } from "@/lib/supabase/server"
import DisplayBoard from "./DisplayBoard"

export const metadata = { title: "Bay Availability | Tee365" }

// Revalidate every 60 seconds as fallback; Realtime handles live updates
export const revalidate = 60

export default async function DisplayPage() {
  const supabase = await createServiceClient()

  const { data: bays } = await supabase
    .from("bays")
    .select("id, number, name")
    .eq("active", true)
    .order("number")

  const now = new Date()
  const dayEnd = new Date(now)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, bay_id, starts_at, ends_at, status")
    .in("status", ["confirmed"])
    .gte("ends_at", now.toISOString())
    .lte("starts_at", dayEnd.toISOString())
    .order("starts_at")

  return (
    <DisplayBoard
      bays={bays ?? []}
      initialBookings={bookings ?? []}
    />
  )
}
