"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { logEvent, logFailure, notifyOwner, getAdminSetting, formatDuration } from "@/lib/observability/notify"

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
    .select("id, user_id, status, starts_at, ends_at, extend_token, duration_minutes, bays(name), profiles!user_id(first_name, last_name)")
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

  // One guarded statement rather than a bare ends_at update, because this
  // and the Stripe webhook's backstop can both run for the same payment.
  // Moving ends_at twice was harmless; incrementing counters twice is not.
  const amountPaid = (pi.amount_received ?? pi.amount ?? 0) / 100
  const { data: applied, error } = await serviceClient.rpc("apply_booking_extension", {
    p_booking_id: bookingId,
    p_new_ends_at: newEndsAt,
    p_amount: amountPaid,
  })

  if (error) {
    await logFailure(serviceClient, "booking-extend-FAILED", `booking=${bookingId} pi=${paymentIntentId} err=${error.message.slice(0, 200)}`)
    throw new Error("Failed to apply extension")
  }

  const result = (Array.isArray(applied) ? applied[0] : applied) as
    { applied: boolean; added_minutes: number; new_extension_total: number } | null

  // Only announce an extension that this call actually applied. If the
  // webhook backstop got there first the RPC is a no-op and the customer has
  // already been told once.
  if (result?.applied) {
    await logEvent(serviceClient, "booking-extended",
      `booking=${bookingId} pi=${paymentIntentId} addedMinutes=${result.added_minutes} ` +
      `amount=$${amountPaid.toFixed(2)} newEndsAt=${newEndsAt}`)

    if (await getAdminSetting(serviceClient, "notify_extensions")) {
      const bay = (booking as unknown as { bays: { name: string } | null }).bays
      const who = (booking as unknown as { profiles: { first_name: string; last_name: string } | null }).profiles
      const name = who ? `${who.first_name} ${who.last_name}` : "A customer"
      const endsLocal = new Date(newEndsAt).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
      })
      await notifyOwner(
        `Session extended: ${name}, ${bay?.name ?? "a bay"}, ` +
        `+${formatDuration(result.added_minutes)} for $${amountPaid.toFixed(2)}. Now ends ${endsLocal}.`
      )
    }
  }

  return { newEndsAt }
}
