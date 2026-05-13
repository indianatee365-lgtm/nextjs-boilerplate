import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceClient = await createServiceClient()

    // Auth check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bayId, startsAt, durationMinutes, couponCode, giftCardCode, disclosureIds } = body

    // Validate inputs
    if (!bayId || !startsAt || !durationMinutes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (durationMinutes < 60 || durationMinutes > 240 || durationMinutes % 30 !== 0) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 })
    }

    const startDate = new Date(startsAt)
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

    // Check bay exists
    const { data: bay } = await serviceClient
      .from("bays")
      .select("id, number, name")
      .eq("id", bayId)
      .eq("active", true)
      .single()

    if (!bay) return NextResponse.json({ error: "Bay not found" }, { status: 404 })

    // Check for conflicts
    const { data: conflicts } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("bay_id", bayId)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", endDate.toISOString())
      .gt("ends_at", startDate.toISOString())

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: "Bay is not available for this time" }, { status: 409 })
    }

    // Check blocked times
    const { data: blocked } = await serviceClient
      .from("blocked_times")
      .select("id")
      .or(`bay_id.eq.${bayId},bay_id.is.null`)
      .lt("starts_at", endDate.toISOString())
      .gt("ends_at", startDate.toISOString())

    if (blocked && blocked.length > 0) {
      return NextResponse.json({ error: "Bay is blocked during this time" }, { status: 409 })
    }

    // Get pricing rules
    const { data: pricingRules } = await serviceClient
      .from("pricing_rules")
      .select("season_type, day_type, time_type, price_per_hour")

    const rulesMap: Record<string, number> = {}
    for (const rule of pricingRules ?? []) {
      rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
    }

    const context = getPricingContext(startDate)
    const key = `${context.seasonType}|${context.dayType}|${context.timeType}`
    const pricePerHour = rulesMap[key] ?? 0

    // Get user's active membership
    const { data: membership } = await serviceClient
      .from("memberships")
      .select("id, plan_id, started_at, membership_plans(slug, discount_percent, first_year_discount)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    let membershipDiscountPercent = 0
    let membershipId: string | null = null

    if (membership) {
      membershipId = membership.id
      const plan = membership.membership_plans as { slug: string; discount_percent: number; first_year_discount: number | null } | null
      if (plan) {
        const startedAt = new Date(membership.started_at)
        const oneYearLater = new Date(startedAt)
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
        const isFirstYear = new Date() < oneYearLater
        membershipDiscountPercent =
          isFirstYear && plan.first_year_discount != null
            ? plan.first_year_discount
            : plan.discount_percent
      }
    }

    // Validate coupon
    let couponId: string | null = null
    let couponDiscountType: "percent" | "fixed" | undefined
    let couponDiscountValue = 0

    if (couponCode) {
      const { data: coupon } = await serviceClient
        .from("coupons")
        .select("id, discount_type, discount_value, max_uses, uses_count, expires_at, max_uses_per_user")
        .eq("code", couponCode.toUpperCase())
        .eq("active", true)
        .single()

      if (!coupon) return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 })
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        return NextResponse.json({ error: "Coupon has expired" }, { status: 400 })
      }
      if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
        return NextResponse.json({ error: "Coupon has reached its usage limit" }, { status: 400 })
      }


      const c = coupon as typeof coupon & { max_uses_per_user: number | null }
      if (c.max_uses_per_user !== null) {
        const { count } = await serviceClient
          .from("coupon_uses")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("user_id", user.id)
        if ((count ?? 0) >= c.max_uses_per_user) {
          return NextResponse.json({ error: "You have already used this coupon" }, { status: 400 })
        }
      }
      couponId = coupon.id
      couponDiscountType = coupon.discount_type as "percent" | "fixed"
      couponDiscountValue = Number(coupon.discount_value)
    }

    // Validate gift card
    let giftCardId: string | null = null
    let giftCardBalance = 0

    if (giftCardCode) {
      const { data: giftCard } = await serviceClient
        .from("gift_cards")
        .select("id, balance, expires_at")
        .eq("code", giftCardCode.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-"))
        .eq("active", true)
        .single()

      if (!giftCard) return NextResponse.json({ error: "Invalid gift card code" }, { status: 400 })
      if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
        return NextResponse.json({ error: "Gift card has expired" }, { status: 400 })
      }
      if (Number(giftCard.balance) <= 0) {
        return NextResponse.json({ error: "Gift card has no remaining balance" }, { status: 400 })
      }

      giftCardId = giftCard.id
      giftCardBalance = Number(giftCard.balance)
    }

    // Calculate price
    const pricing = calculateBookingPrice({
      pricePerHour,
      durationMinutes,
      membershipDiscountPercent,
      couponDiscountType,
      couponDiscountValue,
      giftCardBalance,
      context,
    })

    // Guard against zero/sub-minimum amounts
    const amountCents = Math.round(pricing.total * 100)
    if (amountCents < 50) {
      return NextResponse.json({ error: `Booking total $${pricing.total.toFixed(2)} is below the minimum charge. Check pricing rules.` }, { status: 400 })
    }

    // Retrieve or create a Stripe Customer so the payment method is saved for future use
    const { data: profileForStripe } = await serviceClient
      .from("profiles")
      .select("stripe_customer_id, first_name, last_name")
      .eq("id", user.id)
      .single()

    let stripeCustomerId = (profileForStripe as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null

    if (!stripeCustomerId) {
      const { data: authUser } = await serviceClient.auth.admin.getUserById(user.id)
      const customer = await getStripe().customers.create({
        email: authUser.user?.email ?? undefined,
        name: profileForStripe
          ? `${(profileForStripe as { first_name: string }).first_name} ${(profileForStripe as { last_name: string }).last_name}`.trim()
          : undefined,
        metadata: { supabase_user_id: user.id },
      })
      stripeCustomerId = customer.id
      await serviceClient.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id)
    }

    // Create Stripe PaymentIntent — setup_future_usage saves the card on file for future charges
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      payment_method_types: ["card", "cashapp"],
      customer: stripeCustomerId,
      setup_future_usage: "off_session",
      metadata: {
        userId: user.id,
        bayId,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        durationMinutes: String(durationMinutes),
      },
    })

    // Create booking in pending state
    const { data: booking, error: bookingError } = await serviceClient
      .from("bookings")
      .insert({
        user_id: user.id,
        bay_id: bayId,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
        status: "pending",
        price_per_hour: pricePerHour,
        subtotal: pricing.subtotal,
        membership_discount: pricing.membershipDiscount,
        coupon_discount: pricing.couponDiscount,
        tax: pricing.tax,
        gift_card_applied: pricing.giftCardApplied,
        total: pricing.total,
        membership_id: membershipId,
        coupon_id: couponId,
        gift_card_id: giftCardId,
        stripe_payment_intent_id: paymentIntent.id,
      })
      .select()
      .single()

    if (bookingError || !booking) {
      await getStripe().paymentIntents.cancel(paymentIntent.id)
      return NextResponse.json({ error: `Failed to create booking: ${bookingError?.message ?? "unknown"}` }, { status: 500 })
    }

    // Record disclosure acknowledgments with body snapshot for audit trail
    if (Array.isArray(disclosureIds) && disclosureIds.length > 0) {
      const { data: disclosureBodies } = await serviceClient
        .from("disclosures")
        .select("id, body")
        .in("id", disclosureIds)
      const bodyMap = Object.fromEntries((disclosureBodies ?? []).map((d) => [d.id, d.body]))
      await serviceClient.from("disclosure_acknowledgments").upsert(
        disclosureIds.map((id: string) => ({
          user_id: user.id,
          disclosure_id: id,
          booking_id: booking.id,
          body_snapshot: bodyMap[id] ?? null,
        })),
        { onConflict: "user_id,disclosure_id" }
      )
    }

    return NextResponse.json({
      bookingId: booking.id,
      clientSecret: paymentIntent.client_secret,
      pricing,
      bay,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("[POST /api/bookings]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
