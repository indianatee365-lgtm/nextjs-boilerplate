import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { payOptions, type EventRow, type PayKind } from "@/lib/events"

// Starts a Stripe Checkout for an event payment. Public on purpose: the token
// in the link is the credential, and the amount always comes from the event
// row, never from the request. The webhook records the payment
// (lib/events recordStripeEventPayment), keyed on the PaymentIntent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const kind = body.kind as PayKind
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data } = await db.from("events").select("*").eq("token", token).maybeSingle()
  const e = data as EventRow | null
  if (!e) return NextResponse.json({ error: "We couldn't find that event." }, { status: 404 })
  const opt = payOptions(e).find((o) => o.kind === kind)
  if (!opt) return NextResponse.json({ error: "There's nothing to pay for that right now. Refresh the page." }, { status: 409 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
  const label = kind === "deposit" ? "Deposit" : kind === "balance" ? "Balance" : "Payment in full"
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(opt.amount * 100), product_data: { name: `${e.title}: ${label}`, description: "Tee365 private event" } } }],
    ...(e.contact_email ? { customer_email: e.contact_email } : {}),
    payment_intent_data: {
      description: `Tee365 event: ${e.title} (${label})`,
      metadata: { type: "event", event_id: e.id, kind, amount: String(opt.amount) },
    },
    success_url: `https://tee365.org/event/${token}?paid=1`,
    cancel_url: `https://tee365.org/event/${token}`,
  })
  return NextResponse.json({ url: session.url })
}
