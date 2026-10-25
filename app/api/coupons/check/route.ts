import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// Lets the booking page show a coupon's discount before the slot is reserved.
// Display only: the same checks run again in lib/bookings/create.ts when the
// booking is made, and that is what sets the real charge. Keep the two in step.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ valid: false, error: "Sign in to use a coupon" }, { status: 401 })

  const code = (request.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase()
  if (!code) return NextResponse.json({ valid: false, error: "Enter a code" }, { status: 400 })

  const serviceClient = await createServiceClient()
  const { data: coupon } = await serviceClient
    .from("coupons")
    .select("id, discount_type, discount_value, max_uses, uses_count, expires_at, max_uses_per_user")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle()

  if (!coupon) return NextResponse.json({ valid: false, error: "Invalid coupon code" })
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: "Coupon has expired" })
  }
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return NextResponse.json({ valid: false, error: "Coupon has reached its usage limit" })
  }
  const c = coupon as typeof coupon & { max_uses_per_user: number | null }
  if (c.max_uses_per_user !== null) {
    const { count } = await serviceClient
      .from("coupon_uses")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("user_id", user.id)
    if ((count ?? 0) >= c.max_uses_per_user) {
      return NextResponse.json({ valid: false, error: "You have already used this coupon" })
    }
  }

  return NextResponse.json({
    valid: true,
    discountType: coupon.discount_type as "percent" | "fixed",
    discountValue: Number(coupon.discount_value),
  })
}
