"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { sendBookingConfirmation } from "@/lib/twilio/sms"
import { sendBookingConfirmationEmail } from "@/lib/resend/email"
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

export async function finalizeReschedule({
  originalBookingId,
  newStartsAt,
  newEndsAt,
  newBayId,
  paymentIntentId,
  netCharge,
}: {
  originalBookingId: string
  newStartsAt: string
  newEndsAt: string
  newBayId: string
  paymentIntentId?: string
  netCharge: number
}): Promise<{ newBookingId: string }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: original } = await serviceClient
    .from("bookings")
    .select("id, user_id, status, starts_at, total, duration_minutes, stripe_charge_id")
    .eq("id", originalBookingId)
    .eq("user_id", user.id)
    .single()

  if (!original) throw new Error("Booking not found")
  if (original.status === "cancelled") throw new Error("Booking is already cancelled")

  const hoursUntil = (new Date(original.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursUntil <= 4) throw new Error("Booking is within 4 hours and cannot be rescheduled")

  const ob = original as typeof original & { stripe_charge_id: string | null }

  // Verify payment if a charge was needed
  let newStripeChargeId: string | null = null
  if (paymentIntentId) {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId)
    if (pi.status !== "succeeded") throw new Error("Payment not completed")
    newStripeChargeId = pi.latest_charge as string | null
  }

  // Issue partial refund if customer is owed money back
  if (netCharge < 0 && ob.stripe_charge_id) {
    const refundCents = Math.round(Math.abs(netCharge) * 100)
    if (refundCents >= 1) {
      await getStripe().refunds.create({ charge: ob.stripe_charge_id, amount: refundCents })
    }
  }

  // Re-calculate pricing authoritatively server-side
  const { data: pricingRules } = await serviceClient
    .from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")

  const rulesMap: Record<string, number> = {}
  for (const rule of pricingRules ?? []) {
    rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
  }

  const newStart = new Date(newStartsAt)
  const context = getPricingContext(newStart)
  const pricePerHour = rulesMap[`${context.seasonType}|${context.dayType}|${context.timeType}`] ?? 0

  const { data: membership } = await serviceClient
    .from("memberships")
    .select("id, started_at, membership_plans(discount_percent, first_year_discount)")
    .eq("user_id", user.id).eq("status", "active").single()

  let membershipDiscountPercent = 0
  let membershipId: string | null = null
  if (membership) {
    membershipId = membership.id
    const plan = membership.membership_plans as { discount_percent: number; first_year_discount: number | null } | null
    if (plan) {
      const oneYearLater = new Date(membership.started_at)
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
      membershipDiscountPercent =
        new Date() < oneYearLater && plan.first_year_discount != null
          ? plan.first_year_discount
          : plan.discount_percent
    }
  }

  const newPricing = calculateBookingPrice({
    pricePerHour, durationMinutes: original.duration_minutes, membershipDiscountPercent, context,
  })

  // Final conflict check (race condition guard)
  const { data: conflicts } = await serviceClient
    .from("bookings").select("id")
    .eq("bay_id", newBayId).in("status", ["pending", "confirmed"])
    .neq("id", originalBookingId)
    .lt("starts_at", newEndsAt).gt("ends_at", newStartsAt)

  if (conflicts?.length) {
    throw new Error("That time slot was just taken. Please choose another time.")
  }

  // Cancel original
  await serviceClient.from("bookings").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_by: user.id,
  }).eq("id", originalBookingId)

  // Create new confirmed booking
  const { data: newBooking } = await serviceClient
    .from("bookings")
    .insert({
      user_id: user.id,
      bay_id: newBayId,
      starts_at: newStartsAt,
      ends_at: newEndsAt,
      duration_minutes: original.duration_minutes,
      status: "confirmed",
      price_per_hour: pricePerHour,
      subtotal: newPricing.subtotal,
      membership_discount: newPricing.membershipDiscount,
      coupon_discount: 0,
      tax: newPricing.tax,
      gift_card_applied: 0,
      total: newPricing.total,
      membership_id: membershipId,
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId ?? null,
      stripe_charge_id: newStripeChargeId,
    })
    .select("id")
    .single()

  if (!newBooking) throw new Error("Failed to create rescheduled booking")

  // Send confirmation notifications
  const [{ data: profile }, { data: bay }, { data: { user: authUser } }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, phone").eq("id", user.id).single(),
    serviceClient.from("bays").select("name").eq("id", newBayId).single(),
    serviceClient.auth.admin.getUserById(user.id),
  ])

  const firstName = (profile as { first_name: string; phone: string | null } | null)?.first_name ?? ""
  const phone = (profile as { first_name: string; phone: string | null } | null)?.phone
  const bayName = (bay as { name: string } | null)?.name ?? "Bay"

  if (phone) {
    try {
      await sendBookingConfirmation({ to: phone, firstName, bayName, startsAt: new Date(newStartsAt), endsAt: new Date(newEndsAt) })
    } catch { /* non-fatal */ }
  }

  if (authUser?.email) {
    try {
      await sendBookingConfirmationEmail({
        to: authUser.email, firstName, bayName,
        startsAt: new Date(newStartsAt), endsAt: new Date(newEndsAt),
        subtotal: newPricing.subtotal,
        membershipDiscount: newPricing.membershipDiscount,
        couponDiscount: 0, tax: newPricing.tax, giftCardApplied: 0,
        total: newPricing.total,
      })
    } catch { /* non-fatal */ }
  }

  return { newBookingId: newBooking.id }
}
