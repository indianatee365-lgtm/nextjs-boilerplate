"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { grantFreeMembership } from "@/lib/membership/giveaway"

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
}

export async function redeemMembershipGiveawayCode(
  rawCode: string
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Please log in to redeem a code." }

  const code = normalizeCode(rawCode ?? "")
  if (!code) return { ok: false, message: "Please enter a code." }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: giveaway } = await (serviceClient as any)
    .from("membership_giveaway_codes")
    .select("id, plan_id, free_period, active, expires_at, redeemed_by, membership_plans(id, slug, display_name, name, price_monthly, joining_fee, stripe_price_id, max_members)")
    .eq("code", code)
    .maybeSingle()

  if (!giveaway) return { ok: false, message: "That code is not valid." }
  if (giveaway.redeemed_by) return { ok: false, message: "This code has already been redeemed." }
  if (!giveaway.active) return { ok: false, message: "This code is no longer active." }
  if (giveaway.expires_at && new Date(giveaway.expires_at) < new Date()) {
    return { ok: false, message: "This code has expired." }
  }

  const plan = giveaway.membership_plans as {
    id: string; slug: string; display_name: string | null; name: string
    price_monthly: number; joining_fee: number | null; stripe_price_id: string | null
    max_members: number | null
  } | null
  if (!plan) return { ok: false, message: "This code's plan is no longer available." }

  if (plan.max_members) {
    const { count } = await serviceClient
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id)
      .in("status", ["active", "past_due"])
    if ((count ?? 0) >= plan.max_members) {
      return { ok: false, message: `${plan.display_name ?? plan.name} is full. Contact us to redeem this code for a different plan.` }
    }
  }

  // Atomic claim - if two requests race on the same code, only one wins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: claimed } = await (serviceClient as any)
    .from("membership_giveaway_codes")
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq("id", giveaway.id)
    .is("redeemed_by", null)
    .select("id")
  if (!claimed || claimed.length === 0) {
    return { ok: false, message: "This code has already been redeemed." }
  }

  const result = await grantFreeMembership(serviceClient, {
    userId: user.id,
    userEmail: user.email ?? null,
    plan,
    freePeriod: giveaway.free_period as "month" | "year",
    sourceLabel: `code=${code}`,
  })

  if (result.ok && result.membershipId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any).from("membership_giveaway_codes")
      .update({ membership_id: result.membershipId })
      .eq("id", giveaway.id)
  }

  revalidatePath("/account")
  return { ok: result.ok, message: result.message }
}
