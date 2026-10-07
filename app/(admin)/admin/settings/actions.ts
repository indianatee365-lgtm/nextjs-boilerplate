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
  return { serviceClient }
}

export async function setAdminSetting(key: string, value: boolean) {
  const { serviceClient } = await assertAdmin()
  await serviceClient
    .from("admin_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() })
  revalidatePath("/admin/settings")
}

// Puts a membership plan on sale or takes it off, by flipping
// membership_plans.active. Checkout refuses inactive plans and /join hides
// them from customers, so this one switch is the whole launch (and the whole
// rollback). Existing members keep their benefits either way: bookings read
// the plan through the membership, not through `active`.
// Allowlisted so a stray call can never pull Eagle or Birdie off sale.
const SWITCHABLE_PLANS = ["albatross"]

export async function setPlanOnSale(slug: string, onSale: boolean) {
  if (!SWITCHABLE_PLANS.includes(slug)) throw new Error("Not a switchable plan")
  const { serviceClient } = await assertAdmin()
  await serviceClient.from("membership_plans").update({ active: onSale }).eq("slug", slug)
  revalidatePath("/admin/settings")
  revalidatePath("/join")
}
