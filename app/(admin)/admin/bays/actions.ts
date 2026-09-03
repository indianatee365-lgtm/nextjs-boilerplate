"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")
  return { serviceClient, userId: user.id }
}

// Overrides what /api/bay-agent/sync tells that bay's agent to do, regardless
// of what bookings say. 'maintenance' fully suspends kiosk enforcement so staff
// can use the PC normally (see plan doc: local maintenance.flag does the same
// thing without needing this to be reachable). Passing null clears the override
// and hands control back to the booking schedule.
export async function setBayOverride(bayId: string, overrideState: "occupied" | "available" | "maintenance" | null) {
  const { serviceClient } = await assertAdmin()
  await serviceClient.from("bay_agent_status").update({ override_state: overrideState }).eq("bay_id", bayId)
  revalidatePath("/admin/bays")
}

// Creates a real confirmed booking directly (bypassing pricing/Stripe/SMS -
// this is Jerrod's own "pretend I'm a paying customer" testing flow, not a
// substitute for the actual checkout path). Defaults to the admin's own
// account; an email books it under someone else's account instead (same
// admin.listUsers()-and-match pattern as who-is-up's confirmRoster and
// hour-credits' grantHoursByEmail). duration_minutes is clamped to the
// table's >=60 check constraint for billing-record purposes only - the real
// test window is whatever's actually requested, via starts_at/ends_at.
export async function startTestBooking(formData: FormData) {
  const { serviceClient, userId: adminUserId } = await assertAdmin()

  const bayId = formData.get("bayId") as string
  const durationMinutes = parseInt(formData.get("durationMinutes") as string, 10)
  const customerEmail = (formData.get("customerEmail") as string) || undefined
  if (!bayId || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Invalid input")
  }

  let targetUserId = adminUserId
  if (customerEmail && customerEmail.trim()) {
    const { data: usersPage, error: listError } =
      await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) throw new Error("Failed to look up accounts")
    const match = usersPage.users.find(
      (u: { email?: string }) => u.email?.toLowerCase() === customerEmail.trim().toLowerCase()
    )
    if (!match) throw new Error(`No account found for ${customerEmail}`)
    targetUserId = match.id
  }

  const startsAt = new Date()
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000)

  const { error } = await serviceClient.from("bookings").insert({
    user_id: targetUserId,
    bay_id: bayId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: Math.max(durationMinutes, 60),
    status: "confirmed",
    price_per_hour: 0,
    subtotal: 0,
    total: 0,
  })
  if (error) throw new Error("Failed to create test booking")

  revalidatePath("/admin/bays")
}

// Pushes the bay's currently active booking's end time forward - same
// effect as a customer using the extend widget, just admin-triggered and
// free.
export async function extendActiveBooking(bayId: string, minutes: number) {
  const { serviceClient } = await assertAdmin()
  const now = new Date().toISOString()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, ends_at")
    .eq("bay_id", bayId)
    .eq("status", "confirmed")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!booking) throw new Error("No active booking on this bay right now")

  const currentEnd = new Date(booking.ends_at)
  const newEndsAt = new Date(currentEnd.getTime() + minutes * 60000)

  // This button had no conflict check at all until 2026-09-03 - unlike the
  // customer-paid extend flow (app/api/bookings/extend/route.ts), which
  // already checks both of these before allowing an extension. Jerrod's
  // ask after realizing this free/admin version could silently run a
  // customer's session straight into whoever's booked next on the same
  // bay, with no warning to either side.
  const [{ data: conflicts }, { data: blocked }] = await Promise.all([
    serviceClient.from("bookings").select("id")
      .eq("bay_id", bayId).in("status", ["pending", "confirmed"])
      .neq("id", booking.id)
      .lt("starts_at", newEndsAt.toISOString()).gt("ends_at", currentEnd.toISOString()),
    serviceClient.from("blocked_times").select("id")
      .or(`bay_id.eq.${bayId},bay_id.is.null`)
      .lt("starts_at", newEndsAt.toISOString()).gt("ends_at", currentEnd.toISOString()),
  ])

  if (conflicts?.length || blocked?.length) {
    throw new Error("Can't extend - the next booking or a blocked time on this bay doesn't leave room")
  }

  const { error } = await serviceClient
    .from("bookings")
    .update({ ends_at: newEndsAt.toISOString() })
    .eq("id", booking.id)
  if (error) throw new Error("Failed to extend booking")

  revalidatePath("/admin/bays")
}

// Remote equivalent of the customer's on-screen "Restart Simulator" button -
// companion.py compares restart_requested_at against the last value it
// already acted on (see _tick()'s occupied branch) and triggers the same
// terminate+relaunch it already does locally, so this is one flag write, no
// new capability on the bay side beyond reading one more field.
export async function requestBayRestart(bayId: string) {
  const { serviceClient } = await assertAdmin()
  await serviceClient
    .from("bay_agent_status")
    .update({ restart_requested_at: new Date().toISOString() })
    .eq("bay_id", bayId)
  revalidatePath("/admin/bays")
}
