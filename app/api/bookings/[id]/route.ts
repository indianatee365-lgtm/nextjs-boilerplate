import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, status, user_id, stripe_payment_intent_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .single()

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (booking.stripe_payment_intent_id) {
    await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id).catch(() => {})
  }

  await serviceClient
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq("id", id)

  return NextResponse.json({ ok: true })
}
