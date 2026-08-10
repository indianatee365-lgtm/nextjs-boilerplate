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
  return serviceClient
}

// Overrides what /api/bay-agent/sync tells that bay's agent to do, regardless
// of what bookings say. 'maintenance' fully suspends kiosk enforcement so staff
// can use the PC normally (see plan doc: local maintenance.flag does the same
// thing without needing this to be reachable). Passing null clears the override
// and hands control back to the booking schedule.
export async function setBayOverride(bayId: string, overrideState: "occupied" | "available" | "maintenance" | null) {
  const serviceClient = await assertAdmin()
  await serviceClient.from("bay_agent_status").update({ override_state: overrideState }).eq("bay_id", bayId)
  revalidatePath("/admin/bays")
}
