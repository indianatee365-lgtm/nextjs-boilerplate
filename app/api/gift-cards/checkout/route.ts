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

    const origin = request.headers.get("origin") ?? "https://tee365.org"
    const dollars = (amountCents / 100).toFixed(2)

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `Tee365 Gift Card — $${dollars}`,
            description: `A gift card for ${recipientName} from ${senderName}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        type: "gift_card",
        recipientName,
        recipientEmail,
        senderName,
        amountCents: String(amountCents),
      },
      customer_email: recipientEmail,
      success_url: `${origin}/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift-cards`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("[POST /api/gift-cards/checkout]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
