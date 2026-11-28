import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { createSavedCardsSession } from "@/lib/payments/saved-cards"
import { quoteExtension } from "@/lib/bookings/extend-quote"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Prices an extension (lib/bookings/extend-quote.ts) and, when anything is
// left to pay after hour credits and a gift card, creates the PaymentIntent.
// A fully covered extension gets no PaymentIntent: the page applies it with
// finalizeFreeExtend, which re-prices on the server first.
export async function POST(request: NextRequest) {
  try {
    const { bookingId, token, extendMinutes, giftCardCode } = await request.json()
    if (!bookingId || !token || !extendMinutes) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const serviceClient = await createServiceClient()
    const quote = await quoteExtension(serviceClient, {
      bookingId, token, extendMinutes,
      giftCardCode: typeof giftCardCode === "string" ? giftCardCode : undefined,
    })
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status })

    const common = {
      pricing: quote.pricing,
      netCharge: quote.netCharge,
      currentEndsAt: quote.booking.ends_at,
      newEndsAt: quote.newEndsAt,
      extendMinutes: quote.extendMinutes,
      pricePerHour: quote.pricePerHour,
      context: quote.pricing.context,
      creditHours: quote.creditHours,
      giftCardApplied: quote.giftCardApplied,
      creditsNeedSignIn: quote.creditsNeedSignIn,
    }

    if (quote.netCharge === 0) {
      return NextResponse.json({ ...common, free: true, clientSecret: null, customerSessionClientSecret: null })
    }

    // Saved cards are offered only to the booking's owner signed in on this
    // device. The QR/SMS extend link can be opened by anyone in the group, and
    // it must never let them pay with the owner's card on file.
    let ownerCustomerId: string | null = null
    if (quote.isOwnerSession) {
      const { data: profile } = await serviceClient
        .from("profiles").select("stripe_customer_id").eq("id", quote.booking.user_id).single()
      ownerCustomerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null
    }

    const usesCredits = quote.creditHours > 0 || quote.giftCardApplied > 0
    const pi = await getStripe().paymentIntents.create({
      amount: Math.round(quote.netCharge * 100),
      currency: "usd",
      payment_method_types: ["card", "cashapp"],
      // A saved card can only pay a PaymentIntent for the same Stripe customer.
      ...(ownerCustomerId ? { customer: ownerCustomerId } : {}),
      metadata: {
        type: "extend",
        bookingId,
        newEndsAt: quote.newEndsAt,
        // Hours and gift card dollars to deduct once the card payment
        // succeeds (finalizeExtend, webhook backstop). Absent = card only.
        ...(usesCredits ? {
          creditHours: String(quote.creditHours),
          giftCardId: quote.giftCardId ?? "",
          giftCardApplied: String(quote.giftCardApplied),
        } : {}),
      },
    }, {
      // A flaky phone connection retrying this request for the same extension
      // must never create a second charge. The key changes with anything that
      // changes the PaymentIntent's parameters, because Stripe rejects reusing
      // a key with different parameters. Still no double charge:
      // the extension functions only ever apply one extension per end time.
      idempotencyKey: `extend_${bookingId}_${quote.newEndsAt}${ownerCustomerId ? "_saved" : ""}`
        + (usesCredits ? `_c${quote.creditHours}_g${quote.giftCardId ?? ""}${quote.giftCardApplied}` : ""),
    })
    const customerSessionClientSecret = await createSavedCardsSession(getStripe(), ownerCustomerId)

    return NextResponse.json({
      ...common,
      free: false,
      clientSecret: pi.client_secret,
      customerSessionClientSecret,
    })
  } catch (err) {
    console.error("[POST /api/bookings/extend]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
