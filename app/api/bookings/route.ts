import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { createBooking } from "@/lib/bookings/create"
import { createSavedCardsSession } from "@/lib/payments/saved-cards"
import Stripe from "stripe"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceClient = await createServiceClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bayId, startsAt, durationMinutes, couponCode, giftCardCode, disclosureIds, applyHourCredits, secondBay } = body

    const result = await createBooking({
      serviceClient,
      userId: user.id,
      bayId,
      startsAt,
      durationMinutes,
      couponCode,
      giftCardCode,
      disclosureIds,
      applyHourCredits,
      source: "web",
      secondBay: secondBay === true,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Offer the customer's saved cards in the payment form. createBooking has
    // just made sure they have a Stripe customer. Null on any failure, which
    // only means a blank card form.
    let customerSessionClientSecret: string | null = null
    if (result.clientSecret) {
      const { data: profile } = await serviceClient
        .from("profiles").select("stripe_customer_id").eq("id", user.id).single()
      customerSessionClientSecret = await createSavedCardsSession(
        new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() }),
        (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null,
      )
    }

    return NextResponse.json({
      bookingId: result.bookingId,
      clientSecret: result.clientSecret,
      customerSessionClientSecret,
      pricing: result.pricing,
      bay: result.bay,
      secondBay: result.secondBay ?? null,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("[POST /api/bookings]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
