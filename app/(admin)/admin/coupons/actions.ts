"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createCoupon(formData: FormData) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")

  const name = formData.get("name") as string
  const code = (formData.get("code") as string).toUpperCase().trim()
  const discountType = formData.get("discount_type") as string
  const discountValue = parseFloat(formData.get("discount_value") as string)
  const maxUses = formData.get("max_uses") ? parseInt(formData.get("max_uses") as string) : null
  const maxUsesPerUser = formData.get("max_uses_per_user") ? parseInt(formData.get("max_uses_per_user") as string) : null
  const expiresAt = formData.get("expires_at") ? new Date(formData.get("expires_at") as string).toISOString() : null

  if (!code || !discountType || isNaN(discountValue)) throw new Error("Invalid coupon data")

  const { error } = await serviceClient.from("coupons").insert({
    name: name || null,
    code,
    discount_type: discountType,
    discount_value: discountValue,
    max_uses: maxUses,
    max_uses_per_user: maxUsesPerUser,
    expires_at: expiresAt,
    active: true,
    uses_count: 0,
    created_by: user.id,
  })

  if (error) {
    if (error.code === "23505") throw new Error("A coupon with that code already exists")
    throw new Error("Failed to create coupon")
  }

  revalidatePath("/admin/coupons")
  revalidatePath("/admin")
}

export async function toggleCoupon(id: string, active: boolean) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")

  await serviceClient.from("coupons").update({ active }).eq("id", id)
  revalidatePath("/admin/coupons")
  revalidatePath("/admin")
}
