import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { createBooking } from "@/lib/bookings/create"

// TEMPORARY - fires a REAL test booking through the actual createBooking()
// flow (same code path a real customer's checkout hits), using a one-time
// 100%-off coupon (CLAUDETESTONLY, max_uses=1) so it takes the real $0/free
// branch and sends the real confirmation SMS + email exactly as a customer
// would receive them - not a hand-rolled call to the notification functions.
// Jerrod wants to see the real pipeline work, not just the templates. Bay 1,
// starts 30 min out (clear of the immediate-access-code branch, which only
// fires inside 15 min - this is meant to look like a normal advance booking).
// Delete this route (and the coupon) once confirmed (2026-08-30).
export async function GET() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const startsAt = new Date(Date.now() + 30 * 60 * 1000)

  const result = await createBooking({
    serviceClient,
    userId: user.id,
    bayId: "eb9eef5b-8e34-4b89-87b1-de21e5849406", // Bay 1
    startsAt: startsAt.toISOString(),
    durationMinutes: 60,
    couponCode: "CLAUDETESTONLY",
    source: "web",
  })

  return NextResponse.json(result)
}
