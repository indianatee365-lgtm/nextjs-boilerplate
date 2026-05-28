import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import Stripe from "stripe"

export const RESCHEDULE_FEE = 5.00

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceClient = await createServiceClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { bookingId, newStartsAt } = await request.json()
    if (!bookingId || !newStartsAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("id, user_id, status, starts_at, duration_minutes, total")
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .single()

    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    if (booking.status !== "confirmed" && booking.status !== "pending") {
      return NextResponse.json({ error: "Only active bookings can be rescheduled" }, { status: 400 })
    }

    const hoursUntil = (new Date(booking.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil <= 4) {
      return NextResponse.json({ error: "Bookings within 4 hours cannot be rescheduled" }, { status: 400 })
    }

    const durationMinutes = booking.duration_minutes
    const newStart = new Date(newStartsAt)
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000)

    if (newStart <= new Date()) {
      return NextResponse.json({ error: "New time must be in the future" }, { status: 400 })
    }

    // Find an available bay, excluding the original booking from conflict check
    const { data: bays } = await serviceClient
      .from("bays").select("id, number, name").eq("active", true).order("number")

    if (!bays?.length) return NextResponse.json({ error: "No bays found" }, { status: 500 })

    let newBay: typeof bays[0] | null = null
    for (const bay of bays) {
      const [{ data: conflicts }, { data: blocked }] = await Promise.all([
        serviceClient.from("bookings").select("id")
          .eq("bay_id", bay.id).in("status", ["pending", "confirmed"])
          .neq("id", bookingId)
          .lt("starts_at", newEnd.toISOString()).gt("ends_at", newStart.toISOString()),
        serviceClient.from("blocked_times").select("id")
          .or(`bay_id.eq.${bay.id},bay_id.is.null`)
          .lt("starts_at", newEnd.toISOString()).gt("ends_at", newStart.toISOString()),
      ])
      if (!conflicts?.length && !blocked?.length) { newBay = bay; break }
    }

    if (!newBay) {
      return NextResponse.json({ error: "No bays available for that time" }, { status: 409 })
    }

    // Pricing rules
    const { data: pricingRules } = await serviceClient
      .from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")

    const rulesMap: Record<string, number> = {}
    for (const rule of pricingRules ?? []) {
      rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
    }

    const context = getPricingContext(newStart)
    const pricePerHour = rulesMap[`${context.seasonType}|${context.dayType}|${context.timeType}`] ?? 0

    // User's current membership discount
    const { data: membership } = await serviceClient
      .from("memberships")
      .select("started_at, membership_plans(discount_percent, first_year_discount)")
      .eq("user_id", user.id).eq("status", "active").single()

    let membershipDiscountPercent = 0
    if (membership) {
      const plan = membership.membership_plans as { discount_percent: number; first_year_discount: number | null } | null
      if (plan) {
        const oneYearLater = new Date(membership.started_at)
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
        membershipDiscountPercent =
          new Date() < oneYearLater && plan.first_year_discount != null
            ? plan.first_year_discount
            : plan.discount_percent
      }
    }

    const newPricing = calculateBookingPrice({
      pricePerHour, durationMinutes, membershipDiscountPercent, context,
    })

    const originalTotal = Number(booking.total)
    const delta = parseFloat((newPricing.total - originalTotal).toFixed(2))
    const netCharge = parseFloat((delta + RESCHEDULE_FEE).toFixed(2))

    let clientSecret: string | undefined
    let rescheduled = false

    if (netCharge <= 0 || Math.round(netCharge * 100) < 50) {
      // No extra charge — apply the reschedule immediately
      await serviceClient.from("bookings").update({
        bay_id: newBay.id,
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
      }).eq("id", bookingId)
      rescheduled = true
    } else {
      const pi = await getStripe().paymentIntents.create({
        amount: Math.round(netCharge * 100),
        currency: "usd",
        metadata: {
          type: "reschedule",
          originalBookingId: bookingId,
          newStartsAt: newStart.toISOString(),
          newEndsAt: newEnd.toISOString(),
          newBayId: newBay.id,
        },
      })
      clientSecret = pi.client_secret ?? undefined
    }

    return NextResponse.json({
      newPricing, originalTotal, delta,
      rescheduleFee: RESCHEDULE_FEE,
      netCharge, clientSecret, rescheduled,
      newBayId: newBay.id, newBayName: newBay.name,
      newStartsAt: newStart.toISOString(),
      newEndsAt: newEnd.toISOString(),
      pricePerHour, context,
    })
  } catch (err) {
    console.error("[POST /api/bookings/reschedule]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
