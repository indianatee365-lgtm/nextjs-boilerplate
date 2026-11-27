"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { logFailure } from "@/lib/observability/notify"
import { announceExtension } from "@/lib/bookings/extension-notify"
import { extendBookingAccessToCurrentEnd } from "@/lib/access-control/booking-access"
import { applyExtension, describeCovered } from "@/lib/bookings/apply-extension"
import { quoteExtension } from "@/lib/bookings/extend-quote"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Unlike finalizeReschedule (which cancels + recreates the booking because it
// can move bay/time), extend only ever pushes ends_at forward on the same row.
// Hours or gift card dollars named on the PaymentIntent are deducted in the
// same database transaction (lib/bookings/apply-extension.ts). Called
// directly by the client immediately after Stripe confirms payment; the
// Stripe webhook's "extend" branch is a redundant backstop for the case where
// the customer's phone drops connection right after paying (both writes are
// idempotent - an extension applies once per end time).
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

  const amountPaid = (pi.amount_received ?? pi.amount ?? 0) / 100
  let result
  try {
    result = await applyExtension(serviceClient, {
      bookingId, newEndsAt, amount: amountPaid,
      creditHours: Number(pi.metadata?.creditHours ?? 0),
      giftCardId: pi.metadata?.giftCardId || null,
      giftCardApplied: Number(pi.metadata?.giftCardApplied ?? 0),
      strict: false,
    })
  } catch (e) {
    await logFailure(serviceClient, "booking-extend-FAILED", `booking=${bookingId} pi=${paymentIntentId} err=${String(e).slice(0, 200)}`)
    throw new Error("Failed to apply extension")
  }

  // Only announce an extension that this call actually applied. If the
  // webhook backstop got there first this is a no-op and the customer has
  // already been told once.
  if (result.applied) {
    // Door first: a customer who steps out after their original end time
    // needs their code to still work. Never throws.
    await extendBookingAccessToCurrentEnd(serviceClient, bookingId)
    await announceExtension(serviceClient, {
      bookingId, paymentIntentId, addedMinutes: result.addedMinutes,
      amount: amountPaid, newEndsAt, via: "finalize",
      covered: describeCovered(result.creditHoursUsed, result.giftCardUsed),
    })
  }

  return { newEndsAt }
}

// An extension fully covered by hour credits and/or a gift card: no card,
// no PaymentIntent. Re-prices on the server (never trusts the page) and only
// applies if the price is still $0 and from the same end time the customer
// saw. strict: if the hours or gift card are gone, nothing changes.
export async function finalizeFreeExtend({
  bookingId,
  token,
  extendMinutes,
  newEndsAt,
  giftCardCode,
}: {
  bookingId: string
  token?: string
  extendMinutes: number
  newEndsAt: string
  giftCardCode?: string
}): Promise<{ newEndsAt: string }> {
  const serviceClient = await createServiceClient()

  const quote = await quoteExtension(serviceClient, { bookingId, token, extendMinutes, giftCardCode })
  if (!quote.ok) {
    // A double tap after it already applied: ends_at moved, so the quote is
    // for the next slot. Report success for the end time they asked for.
    const { data: b } = await serviceClient.from("bookings").select("ends_at").eq("id", bookingId).single()
    if (b && new Date(b.ends_at).getTime() >= new Date(newEndsAt).getTime()) return { newEndsAt: b.ends_at }
    throw new Error(quote.error)
  }
  if (quote.newEndsAt !== newEndsAt) {
    const { data: b } = await serviceClient.from("bookings").select("ends_at").eq("id", bookingId).single()
    if (b && new Date(b.ends_at).getTime() >= new Date(newEndsAt).getTime()) return { newEndsAt: b.ends_at }
    throw new Error("Your session changed. Please pick the extension again.")
  }
  if (quote.netCharge !== 0) throw new Error("This extension is no longer fully covered. Please pick it again.")

  let result
  try {
    result = await applyExtension(serviceClient, {
      bookingId, newEndsAt, amount: 0,
      creditHours: quote.creditHours,
      giftCardId: quote.giftCardId,
      giftCardApplied: quote.giftCardApplied,
      strict: true,
    })
  } catch (e) {
    await logFailure(serviceClient, "booking-extend-free-FAILED", `booking=${bookingId} err=${String(e).slice(0, 200)}`)
    throw new Error("We couldn't apply that extension. Please pick it again.")
  }

  if (result.applied) {
    await extendBookingAccessToCurrentEnd(serviceClient, bookingId)
    await announceExtension(serviceClient, {
      bookingId, paymentIntentId: "none", addedMinutes: result.addedMinutes,
      amount: 0, newEndsAt, via: "free",
      covered: describeCovered(result.creditHoursUsed, result.giftCardUsed),
    })
  }
  return { newEndsAt }
}
