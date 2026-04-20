"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function cancelBooking(bookingId: string) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, status, total, stripe_payment_intent_id, stripe_charge_id")
    .eq("id", bookingId)
    .single()

  const b = booking as { id: string; status: string; total: number; stripe_payment_intent_id: string | null; stripe_charge_id: string | null } | null
  if (!b) throw new Error("Booking not found")
  if (b.status === "cancelled") return

  // Issue Stripe refund if paid
  if (b.stripe_charge_id && Number(b.total) > 0) {
    await getStripe().refunds.create({
      charge: b.stripe_charge_id,
    })
  }

  await serviceClient
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      refund_amount: b.total,
      refunded_at: b.stripe_charge_id ? new Date().toISOString() : null,
    })
    .eq("id", bookingId)
}

export async function blockTime({
  bayId,
  startsAt,
  endsAt,
  reason,
}: {
  bayId: string | null
  startsAt: string
  endsAt: string
  reason: string
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  await serviceClient.from("blocked_times").insert({
    bay_id: bayId,
    starts_at: startsAt,
    ends_at: endsAt,
    reason: reason || null,
    created_by: user.id,
  })
}
