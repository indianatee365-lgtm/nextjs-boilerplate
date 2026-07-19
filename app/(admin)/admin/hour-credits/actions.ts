"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"

function generateHourCreditCode(): string {
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
 * Generate one or more redeemable free-hour codes (raffle prizes, sponsorships).
 * Codes are unclaimed until someone redeems them on /account.
 */
export async function createHourCreditCodes(formData: FormData): Promise<void> {
  const { user, serviceClient } = await requireAdmin()

  const hours = parseFloat(formData.get("hours") as string)
  const count = parseInt((formData.get("count") as string) || "1")
  const reason = ((formData.get("reason") as string) || "").trim()
  const expiresAt = formData.get("expires_at")
    ? new Date(formData.get("expires_at") as string).toISOString()
    : null

  if (isNaN(hours) || hours <= 0 || hours > 24) throw new Error("Hours must be between 0 and 24")
  if (isNaN(count) || count < 1 || count > 50) throw new Error("Count must be between 1 and 50")

  const rows = Array.from({ length: count }, () => ({
    code: generateHourCreditCode(),
    hours,
    hours_remaining: hours,
    reason: reason || null,
    expires_at: expiresAt,
    active: true,
    created_by: user.id,
  }))

  const { error } = await serviceClient.from("hour_credits").insert(rows)
  if (error) throw new Error("Failed to create codes")

  revalidatePath("/admin/hour-credits")
}

/**
 * Grant free hours directly to an existing account by email.
 */
export async function grantHoursByEmail(formData: FormData): Promise<void> {
  const { user, serviceClient } = await requireAdmin()

  const email = ((formData.get("email") as string) || "").trim().toLowerCase()
  const hours = parseFloat(formData.get("hours") as string)
  const reason = ((formData.get("reason") as string) || "").trim()
  const expiresAt = formData.get("expires_at")
    ? new Date(formData.get("expires_at") as string).toISOString()
    : null

  if (!email) throw new Error("Email is required")
  if (isNaN(hours) || hours <= 0 || hours > 24) throw new Error("Hours must be between 0 and 24")

  const { data: usersPage, error: listError } =
    await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw new Error("Failed to look up user")

  const target = usersPage.users.find((u: { email?: string }) => u.email?.toLowerCase() === email)
  if (!target) throw new Error(`No account found for ${email}`)

  const { error } = await serviceClient.from("hour_credits").insert({
    user_id: target.id,
    hours,
    hours_remaining: hours,
    reason: reason || null,
    expires_at: expiresAt,
    active: true,
    created_by: user.id,
    redeemed_at: new Date().toISOString(),
  })
  if (error) throw new Error("Failed to grant hours")

  revalidatePath("/admin/hour-credits")
}

export async function toggleHourCredit(id: string, active: boolean): Promise<void> {
  const { serviceClient } = await requireAdmin()
  await serviceClient.from("hour_credits").update({ active }).eq("id", id)
  revalidatePath("/admin/hour-credits")
}
