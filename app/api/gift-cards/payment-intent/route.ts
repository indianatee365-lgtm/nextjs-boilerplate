import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const { amountCents, recipientName, recipientEmail, senderName } = await request.json()

    if (!amountCents || !recipientName || !recipientEmail || !senderName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (typeof amountCents !== "number" || amountCents < 1000 || amountCents > 50000) {
      return NextResponse.json({ error: "Amount must be between $10 and $500" }, { status: 400 })
    }

    // 20% pre-launch discount through Aug 31 2026; amountCents stays as face value for the gift card
    const prelaunchEnd = new Date("2026-09-01T00:00:00Z")
    const chargeAmount = new Date() < prelaunchEnd ? Math.round(amountCents * 0.8) : amountCents

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
      description: `Tee365 Gift Card — $${(amountCents / 100).toFixed(2)} for ${recipientName}`,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error("[POST /api/gift-cards/payment-intent]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
