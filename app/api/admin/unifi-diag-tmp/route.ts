import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// TEMPORARY diagnostic route - reads back the actual state of Josh Farmer's
// booking's UniFi Access schedule/policy/user/PIN directly from the
// controller, to find out why "code doesn't work" happened even though
// grantBayAccess()'s own API calls all returned SUCCESS at creation time.
// Gated the same way every other /admin route is (session + profiles.role
// check) - no separate secret to manage or leave behind. Delete this route
// once the cause is found. Never returns the API token itself.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const { data: profile } = await serviceClient
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bookingId = request.nextUrl.searchParams.get("bookingId") ?? "35e52faf-83fb-4c20-b4a1-9d47c8a8283d"

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, access_code, unifi_visitor_id, unifi_access_policy_id, unifi_schedule_id, starts_at, ends_at")
    .eq("id", bookingId)
    .single()

  if (!booking) return NextResponse.json({ error: "Booking not found" })

  const apiUrl = process.env.UNIFI_ACCESS_API_URL
  const apiToken = process.env.UNIFI_ACCESS_TOKEN
  const doorId = process.env.UNIFI_DOOR_ID

  if (!apiUrl || !apiToken || !doorId) {
    return NextResponse.json({ error: "UniFi env vars not configured", hasUrl: !!apiUrl, hasToken: !!apiToken, hasDoorId: !!doorId })
  }

  const headers = { Authorization: `Bearer ${apiToken}` }

  async function get(path: string) {
    try {
      const res = await fetch(`${apiUrl}${path}`, { headers })
      const json = await res.json()
      return { status: res.status, body: json }
    } catch (e) {
      return { error: String(e) }
    }
  }

  const b = booking as {
    id: string; access_code: string | null
    unifi_visitor_id: string | null; unifi_access_policy_id: string | null; unifi_schedule_id: string | null
    starts_at: string; ends_at: string
  }

  const [door, schedule, policy, userResult] = await Promise.all([
    get(`/doors/${doorId}`),
    b.unifi_schedule_id ? get(`/access_policies/schedules/${b.unifi_schedule_id}`) : null,
    b.unifi_access_policy_id ? get(`/access_policies/${b.unifi_access_policy_id}`) : null,
    b.unifi_visitor_id ? get(`/users/${b.unifi_visitor_id}`) : null,
  ])

  const pinCodes = b.unifi_visitor_id ? await get(`/users/${b.unifi_visitor_id}/pin_codes`) : null

  return NextResponse.json({
    booking: { id: b.id, access_code: b.access_code, starts_at: b.starts_at, ends_at: b.ends_at },
    configuredDoorId: doorId,
    door,
    schedule,
    policy,
    user: userResult,
    pinCodes,
    serverNowUTC: new Date().toISOString(),
  })
}
