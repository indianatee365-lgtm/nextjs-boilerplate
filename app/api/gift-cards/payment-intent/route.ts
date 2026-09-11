import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { logFailure } from "@/lib/observability/notify"
import { createServiceClient } from "@/lib/supabase/server"
import { checkoutRatelimit } from "@/lib/ratelimit"
import { getDiscount, effectivePercent } from "@/lib/admin/discounts"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
    const { success } = await checkoutRatelimit.limit(ip)
    if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { amountCents, recipientName, recipientEmail, senderName } = await request.json()

    if (!amountCents || !recipientName || !recipientEmail || !senderName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (typeof amountCents !== "number" || amountCents < 1000 || amountCents > 50000) {
      return NextResponse.json({ error: "Amount must be between $10 and $500" }, { status: 400 })
    }

    // Admin-controlled sale (see /admin/discounts). amountCents stays the
    // card's face value, only what we charge moves - a discounted $100 card
    // still loads $100 of balance. Was a hardcoded "before Sept 1 2026" date
    // check, which expired silently while the site kept advertising 20% off.
    const serviceClient = await createServiceClient()
    const giftCardDiscount = await getDiscount(serviceClient, "gift_card")
    const percentOff = effectivePercent(giftCardDiscount)
    const chargeAmount = percentOff > 0
      ? Math.round(amountCents * (1 - percentOff / 100))
      : amountCents

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: chargeAmount,
      currency: "usd",
      payment_method_types: ["card", "cashapp"],
      metadata: {
        type: "gift_card",
        recipientName,
        recipientEmail,
        senderName,
        amountCents: String(amountCents),
      },
      description: `Tee365 Gift Card $${(amountCents / 100).toFixed(2)} for ${recipientName}`,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    try {
      const sc = await createServiceClient()
      await logFailure(sc, "gift-card-checkout-API-FAILED",
        `err=${String(err).slice(0, 300)}`,
        `ALERT /api/gift-cards/payment-intent failed, customer hit Buy and our API errored. Reason: ${String(err).slice(0, 150)}.`)
    } catch { /* best-effort */ }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
