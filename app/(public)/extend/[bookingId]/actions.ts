"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { logEvent, logFailure } from "@/lib/observability/notify"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Unlike finalizeReschedule (which cancels + recreates the booking because it
// can move bay/time), extend only ever pushes ends_at forward on the same row -
// no new booking, no credit-hours bookkeeping, nothing else changes. Called
// directly by the client immediately after Stripe confirms payment; the
// Stripe webhook's "extend" branch is a redundant backstop for the case where
// the customer's phone drops connection right after paying (both writes are
// idempotent - applying the same ends_at twice has no different effect than once).
export async function finalizeExtend({
  bookingId,
  token,
  newEndsAt,
  paymentIntentId,
}: {
  bookingId: string
  token?: string
  newEndsAt: string
  paymentIntentId: string
}): Promise<{ newEndsAt: string }> {
  const serviceClient = await createServiceClient()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, ends_at, extend_token")
    .eq("id", bookingId)
    .single()

  if (!booking) throw new Error("Booking not found")

  let authorized = Boolean(token && booking.extend_token && token === booking.extend_token)
  if (!authorized) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    authorized = Boolean(user && user.id === booking.user_id)
  }
  if (!authorized) throw new Error("Unauthorized")

  if (booking.status !== "confirmed") throw new Error("Booking is no longer active")

  // Authoritative check: never trust the client's claim that payment succeeded.
  const pi = await getStripe().paymentIntents.retrieve(paymentIntentId)
  if (pi.status !== "succeeded") throw new Error("Payment not completed")
  if (pi.metadata?.bookingId !== bookingId || pi.metadata?.newEndsAt !== newEndsAt) {
    throw new Error("Payment does not match this extension request")
  }

  // A customer who was mid-session and got interrupted (or double-tapped the
  // button) could retry after ends_at already moved once - only move it forward,
  // never backward, and only from the ends_at this PaymentIntent was priced against.
  if (new Date(newEndsAt) <= new Date(booking.ends_at)) {
    return { newEndsAt: booking.ends_at }
  }

  const { error } = await serviceClient
    .from("bookings")
    .update({ ends_at: newEndsAt })
    .eq("id", bookingId)
    .eq("status", "confirmed")

  if (error) {
    await logFailure(serviceClient, "booking-extend-FAILED", `booking=${bookingId} pi=${paymentIntentId} err=${error.message.slice(0, 200)}`)
    throw new Error("Failed to apply extension")
  }

  await logEvent(serviceClient, "booking-extended", `booking=${bookingId} pi=${paymentIntentId} newEndsAt=${newEndsAt}`)

  return { newEndsAt }
}
