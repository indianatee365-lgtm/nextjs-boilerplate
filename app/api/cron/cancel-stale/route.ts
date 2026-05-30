import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
})

const EXPIRY_MINUTES = 15

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000).toISOString()

  const { data: stale } = await serviceClient
    .from("bookings")
    .select("id, stripe_payment_intent_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)

  if (!stale?.length) return NextResponse.json({ cancelled: 0 })

  await Promise.all(
    stale.map(async (b) => {
      if (b.stripe_payment_intent_id) {
        await stripe.paymentIntents.cancel(b.stripe_payment_intent_id).catch(() => {})
      }
      await serviceClient
        .from("bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", b.id)
    })
  )

  console.log(`[cancel-stale] cancelled ${stale.length} bookings`)
  return NextResponse.json({ cancelled: stale.length })
}
