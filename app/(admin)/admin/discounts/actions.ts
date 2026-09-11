"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { logEvent } from "@/lib/observability/notify"
import type { DiscountKind } from "@/lib/admin/discounts"

const VALID_KINDS: DiscountKind[] = ["gift_card", "booking_hours"]

export async function saveDiscount(formData: FormData) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")

  const kind = formData.get("kind") as DiscountKind
  if (!VALID_KINDS.includes(kind)) throw new Error("Unknown discount type")

  // "Turn off" is its own button rather than a percent of 0, so ending a sale
  // can't be confused with saving a half-filled form.
  const turnOff = formData.get("intent") === "off"
  const rawPercent = (formData.get("percent_off") as string | null)?.trim() ?? ""
  const percent = turnOff ? 0 : Number(rawPercent)

  if (!turnOff) {
    if (rawPercent === "" || Number.isNaN(percent)) throw new Error("Enter a discount percentage")
    if (percent <= 0 || percent > 100) throw new Error("Discount must be between 1 and 100 percent")
  }

  const { error } = await serviceClient
    .from("promo_discounts")
    .update({
      percent_off: percent,
      active: !turnOff,
      updated_at: new Date().toISOString(),
    })
    .eq("kind", kind)

  if (error) throw new Error(error.message)

  await logEvent(
    serviceClient,
    turnOff ? "discount-disabled" : "discount-enabled",
    `kind=${kind} percent=${percent} by=${user.id}`,
  )

  // The storefront reads these to decide what to advertise, so a stale cached
  // page would put the site right back to promising a sale it isn't giving -
  // which is the exact bug this feature exists to prevent.
  revalidatePath("/admin/discounts")
  revalidatePath("/gift-cards")
  revalidatePath("/book")
  revalidatePath("/")
}
