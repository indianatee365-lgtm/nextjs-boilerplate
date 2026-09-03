"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"

function generateGiveawayCode(): string {
  return randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
}

async function requireAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")
  return { user, serviceClient }
}

/**
 * Generate one or more printable, single-use free-membership codes.
 * Each code is redeemed on /account for exactly one person - see
 * membership-giveaway-actions.ts for what redemption actually does.
 */
export async function createGiveawayCodes(formData: FormData): Promise<void> {
  const { user, serviceClient } = await requireAdmin()

  const planId = formData.get("plan_id") as string
  const freePeriod = formData.get("free_period") as string
  const count = parseInt((formData.get("count") as string) || "1")
  const note = ((formData.get("note") as string) || "").trim()
  const expiresAt = formData.get("expires_at")
    ? new Date(formData.get("expires_at") as string).toISOString()
    : null

  if (!planId) throw new Error("Plan is required")
  if (!["month", "year"].includes(freePeriod)) throw new Error("Free period must be month or year")
  if (isNaN(count) || count < 1 || count > 50) throw new Error("Count must be between 1 and 50")

  const { data: plan } = await serviceClient
    .from("membership_plans")
    .select("id")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle()
  if (!plan) throw new Error("Plan not found")

  const rows = Array.from({ length: count }, () => ({
    code: generateGiveawayCode(),
    plan_id: planId,
    free_period: freePeriod,
    note: note || null,
    expires_at: expiresAt,
    active: true,
    created_by: user.id,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any).from("membership_giveaway_codes").insert(rows)
  if (error) throw new Error("Failed to create codes")

  revalidatePath("/admin/membership-giveaways")
}

export async function toggleGiveawayCode(id: string, active: boolean): Promise<void> {
  const { serviceClient } = await requireAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("membership_giveaway_codes").update({ active }).eq("id", id)
  revalidatePath("/admin/membership-giveaways")
}
