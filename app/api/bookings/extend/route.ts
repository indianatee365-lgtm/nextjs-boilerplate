import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import Stripe from "stripe"
import { isInFirstYear } from "@/lib/membership/first-year"

// Available extension lengths offered on the extend page, capped by whatever
// room is actually free on the bay before the next booking/block.
export const EXTEND_OPTIONS_MINUTES = [30, 60]

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Mirrors app/api/bookings/reschedule/route.ts's shape (conflict-check -> reprice
// -> PaymentIntent), simplified because extend never changes the bay or start
// time - only how far out ends_at moves.
export async function POST(request: NextRequest) {
  try {
    const { bookingId, token, extendMinutes } = await request.json()
    if (!bookingId || !token || !extendMinutes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!EXTEND_OPTIONS_MINUTES.includes(extendMinutes)) {
      return NextResponse.json({ error: "Invalid extension length" }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("id, user_id, bay_id, status, ends_at, extend_token")
      .eq("id", bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })

    // Accept either the QR/SMS extend token (phone has no session mid-round)
    // or a logged-in session matching the booking's owner.
    let authorized = booking.extend_token && token === booking.extend_token
    if (!authorized) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      authorized = Boolean(user && user.id === booking.user_id)
    }
    if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: "Only active bookings can be extended" }, { status: 400 })
    }

    const currentEnd = new Date(booking.ends_at)
    if (currentEnd <= new Date()) {
      return NextResponse.json({ error: "This session has already ended" }, { status: 400 })
    }

    const newEnd = new Date(currentEnd.getTime() + extendMinutes * 60 * 1000)

    const [{ data: conflicts }, { data: blocked }] = await Promise.all([
      serviceClient.from("bookings").select("id")
        .eq("bay_id", booking.bay_id).in("status", ["pending", "confirmed"])
        .neq("id", bookingId)
        .lt("starts_at", newEnd.toISOString()).gt("ends_at", currentEnd.toISOString()),
      serviceClient.from("blocked_times").select("id")
        .or(`bay_id.eq.${booking.bay_id},bay_id.is.null`)
        .lt("starts_at", newEnd.toISOString()).gt("ends_at", currentEnd.toISOString()),
    ])

    if (conflicts?.length || blocked?.length) {
      return NextResponse.json({ error: "The next booking on this bay doesn't leave room to extend by that much" }, { status: 409 })
    }

    // Pricing rules + the booking owner's current membership discount, same
    // inputs reschedule uses, just sourced via booking.user_id since we may
    // not have a session (token-authorized phone request).
    const { data: pricingRules } = await serviceClient
      .from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")

    const rulesMap: Record<string, number> = {}
    for (const rule of pricingRules ?? []) {
      rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
    }

    // Priced at the current moment's rate (extension time is now, not the
    // original booking's slot), same convention as reschedule pricing the new slot.
    const context = getPricingContext(new Date())
    const pricePerHour = rulesMap[`${context.seasonType}|${context.dayType}|${context.timeType}`] ?? 0

    const { data: membership } = await serviceClient
      .from("memberships")
      .select("started_at, year_one_discount_expires_at, membership_plans(discount_percent, first_year_discount)")
      .eq("user_id", booking.user_id).eq("status", "active").single()

    let membershipDiscountPercent = 0
    if (membership) {
      const plan = membership.membership_plans as { discount_percent: number; first_year_discount: number | null } | null
      if (plan) {
        const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null })
        membershipDiscountPercent =
          isFirstYear && plan.first_year_discount != null
            ? plan.first_year_discount
            : plan.discount_percent
      }
    }

    const pricing = calculateBookingPrice({
      pricePerHour, durationMinutes: extendMinutes, membershipDiscountPercent, context,
    })

    const netCharge = pricing.total

    if (Math.round(netCharge * 100) < 50) {
      return NextResponse.json({ error: "Something went wrong calculating the price. Please contact us at info@tee365.org." }, { status: 400 })
    }

    const pi = await getStripe().paymentIntents.create({
      amount: Math.round(netCharge * 100),
      currency: "usd",
      payment_method_types: ["card", "cashapp"],
      metadata: {
        type: "extend",
        bookingId,
        newEndsAt: newEnd.toISOString(),
      },
    }, {
      // A flaky phone connection retrying this request for the same extension
      // must never create a second charge.
      idempotencyKey: `extend_${bookingId}_${newEnd.toISOString()}`,
    })

    return NextResponse.json({
      pricing, netCharge,
      clientSecret: pi.client_secret,
      currentEndsAt: booking.ends_at,
      newEndsAt: newEnd.toISOString(),
      extendMinutes,
      pricePerHour, context,
    })
  } catch (err) {
    console.error("[POST /api/bookings/extend]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
