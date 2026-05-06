"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function cancelBookingByCustomer(bookingId: string): Promise<{ refunded: boolean }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, starts_at, total, stripe_payment_intent_id, stripe_charge_id")
    .eq("id", bookingId)
    .eq("user_id", user.id)
    .single()

  if (!booking) throw new Error("Booking not found")
  if (booking.status === "cancelled") return { refunded: false }

  const hoursUntil = (new Date(booking.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
  const refundEligible = hoursUntil > 24

  const b = booking as typeof booking & {
    stripe_payment_intent_id: string | null
    stripe_charge_id: string | null
  }

  if (b.status === "pending" && b.stripe_payment_intent_id) {
    try {
      await getStripe().paymentIntents.cancel(b.stripe_payment_intent_id)
    } catch { /* already cancelled or captured */ }
  } else if (refundEligible && b.stripe_charge_id && Number(b.total) > 0) {
    await getStripe().refunds.create({ charge: b.stripe_charge_id })
  }

  await serviceClient
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      refund_amount: refundEligible ? b.total : 0,
      refunded_at: refundEligible && b.stripe_charge_id ? new Date().toISOString() : null,
    })
    .eq("id", bookingId)

  return { refunded: refundEligible }
}
