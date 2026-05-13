import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { amountCents, recipientName, recipientEmail, senderName } = await request.json()

    if (!amountCents || !recipientName || !recipientEmail || !senderName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (typeof amountCents !== "number" || amountCents < 1000 || amountCents > 50000) {
      return NextResponse.json({ error: "Amount must be between $10 and $500" }, { status: 400 })
    }

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      metadata: {
        type: "gift_card",
        recipientName,
        recipientEmail,
        senderName,
        amountCents: String(amountCents),
        userId: user.id,
      },
      description: `Tee365 Gift Card — $${(amountCents / 100).toFixed(2)} for ${recipientName}`,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error("[POST /api/gift-cards/payment-intent]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
