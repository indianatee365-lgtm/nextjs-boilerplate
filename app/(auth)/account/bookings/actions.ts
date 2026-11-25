"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { getVeteranDiscountPercent } from "@/lib/pricing/veteran"
import { sendBookingCancellationSms, sendBookingRescheduledSms } from "@/lib/telnyx/sms"
import { sendBookingCancellationEmail, sendBookingRescheduledEmail } from "@/lib/resend/email"
import Stripe from "stripe"
import { isInFirstYear } from "@/lib/membership/first-year"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { restoreHourCredits, moveHourCreditUses } from "@/lib/hour-credits"
import { revokeBookingAccess } from "@/lib/access-control/booking-access"
import { cancelBookingGroup, getBookingGroup, groupChargeIds, refundAcrossCharges } from "@/lib/bookings/group"
import { applyGroupReschedule, cancelOneBayOfGroup, quoteGroupReschedule } from "@/lib/bookings/group-changes"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function cancelBookingByCustomer(
  bookingId: string,
  { onlyThisBay = false }: { onlyThisBay?: boolean } = {},
): Promise<{ refunded: boolean }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select(`
      id, user_id, status, starts_at, ends_at, total, stripe_payment_intent_id, stripe_charge_id,
      bays(name)
    `)
    .eq("id", bookingId)
    .eq("user_id", user.id)
    .single()

  if (!booking) throw new Error("Booking not found")
  if (booking.status === "cancelled") return { refunded: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: evLink } = await (serviceClient as any).from("bookings").select("event_id").eq("id", bookingId).single()
  if ((evLink as { event_id: string | null } | null)?.event_id) throw new Error("This is part of a private event. Call us at (574) 444-9365 to make changes.")

  // KNOWN LOOPHOLE: a customer within the forfeit window can pay the $5 reschedule fee to move
  // their booking far into the future, then cancel for a full refund. Tracked -- fix if it becomes
  // a pattern. Fix: add forfeit_on_cancel flag set at reschedule time when hoursUntil <= 24.
  const hoursUntil = (new Date(booking.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
  const refundEligible = hoursUntil > 24

  // Either bay of a two-bay booking: both cancel together, with one refund of
  // the single payment that covered them. See lib/bookings/group.ts.
  const group = await getBookingGroup(serviceClient, bookingId)
  if (group.length > 1) {
    // Just one bay: its share comes back, the other bay stays booked.
    if (onlyThisBay && await cancelOneBayOfGroup(serviceClient, group, bookingId, { actorId: user.id, refundEligible })) {
      return { refunded: refundEligible }
    }
    await cancelBookingGroup(serviceClient, group, { actorId: user.id, refundEligible })
    return { refunded: refundEligible }
  }

  const b = booking as typeof booking & {
    stripe_payment_intent_id: string | null
    stripe_charge_id: string | null
    bays: { name: string } | null
  }

  // A moved booking carries its original payment plus the reschedule fee
  // payment(s) in extra_charge_ids (2026-11-24). A refund covers all of them.
  // extra_charge_ids is newer than lib/supabase/types.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: extraRow } = await (serviceClient as any)
    .from("bookings").select("extra_charge_ids").eq("id", bookingId).single()
  const chargeIds = groupChargeIds({
    stripe_charge_id: b.stripe_charge_id,
    extra_charge_ids: (extraRow as { extra_charge_ids: string[] | null } | null)?.extra_charge_ids ?? [],
  })

  if (b.status === "pending" && b.stripe_payment_intent_id) {
    try {
      await getStripe().paymentIntents.cancel(b.stripe_payment_intent_id)
    } catch { /* already cancelled or captured */ }
  } else if (refundEligible && chargeIds.length > 0 && Number(b.total) > 0) {
    // Refunds whatever is still unrefunded on each payment, so a retry after
    // a partial failure never refunds anything twice.
    await refundAcrossCharges(chargeIds, Number.MAX_SAFE_INTEGER)
  }

  // Only a paid, charged booking actually gets money back - a pending booking's
  // total was never captured, so telling that customer "refunded" would be false.
  const refundIssued = refundEligible && chargeIds.length > 0 && Number(b.total) > 0

  await serviceClient
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
      refund_amount: refundEligible ? b.total : 0,
      refunded_at: refundEligible && chargeIds.length > 0 ? new Date().toISOString() : null,
    })
    .eq("id", bookingId)

  // Kill the door code now instead of waiting up to 15 minutes for the
  // revoke-access cron. Never throws, and the cron still backstops it.
  await revokeBookingAccess(serviceClient, bookingId)

  // Hour credits follow the same forfeit rules as dollars: refund-eligible cancels
  // get their hours back; inside the forfeit window they are lost. Pending bookings
  // never consumed credits, so restoring is a safe no-op there.
  const creditHoursRestored = (refundEligible || b.status === "pending")
    ? await restoreHourCredits(serviceClient, bookingId)
    : 0

  if (b.bays) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("first_name, phone, sms_consent")
      .eq("id", user.id)
      .single()
    const p = profile as { first_name: string; phone: string | null; sms_consent: boolean } | null

    if (p?.phone && p.sms_consent) {
      try {
        await sendBookingCancellationSms({
          to: p.phone,
          firstName: p.first_name,
          bayName: b.bays.name,
          startsAt: new Date(b.starts_at),
          endsAt: new Date(b.ends_at),
          refundAmount: refundIssued ? Number(b.total) : 0,
          creditHoursRestored,
        })
      } catch (e) {
        await logFailure(serviceClient, "booking-cancellation-sms-FAILED",
          `booking=${bookingId} err=${String(e).slice(0, 200)}`)
      }
    }

    if (user.email) {
      try {
        await sendBookingCancellationEmail({
          to: user.email,
          firstName: p?.first_name ?? "",
          bayName: b.bays.name,
          startsAt: new Date(b.starts_at),
          endsAt: new Date(b.ends_at),
          refundAmount: refundIssued ? Number(b.total) : 0,
          creditHoursRestored,
        })
      } catch (e) {
        await logFailure(serviceClient, "booking-cancellation-email-FAILED",
          `booking=${bookingId} err=${String(e).slice(0, 200)}`)
      }
    }
  }

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
    .select("id, user_id, status, starts_at, total, duration_minutes, stripe_charge_id, credit_hours_applied, grounds_crew_minutes, parent_booking_id, extension_minutes")
    .eq("id", originalBookingId)
    .eq("user_id", user.id)
    .single()

  if (!original) throw new Error("Booking not found")
  if (original.status === "cancelled") throw new Error("Booking is already cancelled")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: evLink } = await (serviceClient as any).from("bookings").select("event_id").eq("id", originalBookingId).single()
  if ((evLink as { event_id: string | null } | null)?.event_id) throw new Error("This is part of a private event. Call us at (574) 444-9365 to make changes.")
  // Two-bay booking: both bays move together (lib/bookings/group-changes.ts).
  const group = await getBookingGroup(serviceClient, originalBookingId)
  if (group.filter((g) => g.status !== "cancelled").length > 1) {
    let chargeId: string | null = null
    let startsAt = newStartsAt
    if (paymentIntentId) {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntentId)
      if (pi.status !== "succeeded") throw new Error("Payment not completed")
      if (pi.metadata?.type !== "group-reschedule" || pi.metadata.parentBookingId !== group[0].id) {
        throw new Error("That payment doesn't match this booking. Contact us at info@tee365.org.")
      }
      chargeId = pi.latest_charge as string | null
      startsAt = pi.metadata.newStartsAt
    } else {
      const q = await quoteGroupReschedule(serviceClient, user.id, group, newStartsAt)
      if (!q.ok) throw new Error(q.error)
      if (Math.round(q.quote.netCharge * 100) >= 50) throw new Error("This change needs a payment. Go back and pick the time again.")
    }
    await applyGroupReschedule(serviceClient, user.id, group, startsAt, { chargeId })
    return { newBookingId: group[0].id }
  }
  if (Number((original as { grounds_crew_minutes?: number }).grounds_crew_minutes ?? 0) > 0) {
    throw new Error("Grounds Crew bookings can't be moved. Cancel this one and book the new time, it's still free.")
  }

  const hoursUntil = (new Date(original.starts_at).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursUntil <= 4) throw new Error("Booking is within 4 hours and cannot be rescheduled")
  // Same guard as /api/bookings/reschedule, repeated here because this is the
  // step that actually cancels and recreates the row (without any extension).
  if (Number((original as { extension_minutes?: number }).extension_minutes ?? 0) > 0) {
    throw new Error("This booking has extra time added to it, so it can't be moved online. Call us at (574) 444-9365 and we'll move it for you.")
  }

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
    .select("id, started_at, year_one_discount_expires_at, membership_plans(discount_percent, first_year_discount)")
    .eq("user_id", user.id).eq("status", "active").single()

  let membershipDiscountPercent = 0
  let membershipId: string | null = null
  if (membership) {
    membershipId = membership.id
    const plan = membership.membership_plans as { discount_percent: number; first_year_discount: number | null } | null
    if (plan) {
      const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null })
      membershipDiscountPercent =
        isFirstYear && plan.first_year_discount != null
          ? plan.first_year_discount
          : plan.discount_percent
    }
  }

  const veteranDiscountPercent = await getVeteranDiscountPercent(serviceClient, user.id)

  // Carry the original booking's hour credits over so rescheduling never costs the
  // customer their free hours; value is recomputed at the new slot's rate.
  const carriedCreditHours = Number((original as { credit_hours_applied?: number }).credit_hours_applied ?? 0)

  const newPricing = calculateBookingPrice({
    pricePerHour, durationMinutes: original.duration_minutes, membershipDiscountPercent, context,
    veteranDiscountPercent,
    creditHours: carriedCreditHours,
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

  // The new booking takes over the original payment (2026-11-24). Before,
  // the new row kept only the reschedule fee charge and the original payment
  // stayed on the cancelled row, so cancelling the moved booking refunded the
  // $5 fee and never the booking itself. Same approach as two-bay bookings
  // (lib/bookings/group-changes.ts): main charge stays, fee charges go in
  // extra_charge_ids. The PI column is UNIQUE, so the old row lets go first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payRow } = await (serviceClient as any)
    .from("bookings")
    .select("stripe_payment_intent_id, stripe_charge_id, extra_charge_ids")
    .eq("id", originalBookingId)
    .single()
  const origPay = (payRow ?? {}) as {
    stripe_payment_intent_id: string | null; stripe_charge_id: string | null; extra_charge_ids: string[] | null
  }
  const mainChargeId = origPay.stripe_charge_id ?? newStripeChargeId
  const mainPaymentIntentId = origPay.stripe_charge_id ? origPay.stripe_payment_intent_id : (paymentIntentId ?? null)
  const extraChargeIds = [
    ...(origPay.extra_charge_ids ?? []),
    ...(newStripeChargeId && newStripeChargeId !== mainChargeId ? [newStripeChargeId] : []),
  ]

  // Cancel original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("bookings").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_by: user.id,
    stripe_payment_intent_id: null,
    stripe_charge_id: null,
    extra_charge_ids: [],
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
      credit_hours_applied: newPricing.creditHoursApplied,
      credit_discount: newPricing.creditDiscount,
      total: newPricing.total,
      membership_id: membershipId,
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: mainPaymentIntentId,
      stripe_charge_id: mainChargeId,
    })
    .select("id")
    .single()

  if (!newBooking) {
    // Put the payment back on the original so it is never orphaned.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any).from("bookings").update({
      stripe_payment_intent_id: origPay.stripe_payment_intent_id,
      stripe_charge_id: origPay.stripe_charge_id,
      extra_charge_ids: origPay.extra_charge_ids ?? [],
    }).eq("id", originalBookingId)
    await logFailure(serviceClient, "reschedule-insert-FAILED",
      `original=${originalBookingId} charge=${mainChargeId} fee=${newStripeChargeId}`)
    throw new Error("Failed to create rescheduled booking")
  }
  if (extraChargeIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any).from("bookings").update({ extra_charge_ids: extraChargeIds }).eq("id", newBooking.id)
  }
  await logEvent(serviceClient, "reschedule-payment-moved",
    `original=${originalBookingId} new=${newBooking.id} charge=${mainChargeId} extra=${extraChargeIds.join(",") || "none"}`)

  // Keep credit usage attached to the live booking so a later cancellation
  // restores the right hours.
  if (carriedCreditHours > 0) {
    await moveHourCreditUses(serviceClient, originalBookingId, newBooking.id)
  }

  // Send confirmation notifications
  const [{ data: profile }, { data: bay }, { data: { user: authUser } }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, phone, sms_consent").eq("id", user.id).single(),
    serviceClient.from("bays").select("name").eq("id", newBayId).single(),
    serviceClient.auth.admin.getUserById(user.id),
  ])

  const firstName = (profile as { first_name: string; phone: string | null; sms_consent: boolean } | null)?.first_name ?? ""
  const phone = (profile as { first_name: string; phone: string | null; sms_consent: boolean } | null)?.phone
  const smsConsent = (profile as { first_name: string; phone: string | null; sms_consent: boolean } | null)?.sms_consent ?? false
  const bayName = (bay as { name: string } | null)?.name ?? "Bay"

  if (phone && smsConsent) {
    try {
      await sendBookingRescheduledSms({ to: phone, firstName, bayName, startsAt: new Date(newStartsAt), endsAt: new Date(newEndsAt) })
      await logEvent(serviceClient, "reschedule-sms-sent", `newBooking=${newBooking.id} to=${phone}`)
    } catch (e) {
      await logFailure(serviceClient, "reschedule-sms-FAILED",
        `newBooking=${newBooking.id} to=${phone} err=${String(e).slice(0, 200)}`)
    }
  }

  if (authUser?.email) {
    try {
      await sendBookingRescheduledEmail({
        to: authUser.email, firstName, bayName,
        startsAt: new Date(newStartsAt), endsAt: new Date(newEndsAt),
        subtotal: newPricing.subtotal,
        membershipDiscount: newPricing.membershipDiscount,
        couponDiscount: 0, tax: newPricing.tax, giftCardApplied: 0,
        hourCreditDiscount: newPricing.creditDiscount,
        total: newPricing.total,
      })
      await logEvent(serviceClient, "reschedule-email-sent", `newBooking=${newBooking.id} to=${authUser.email}`)
    } catch (e) {
      await logFailure(serviceClient, "reschedule-email-FAILED",
        `newBooking=${newBooking.id} to=${authUser.email} err=${String(e).slice(0, 200)}`)
    }
  }

  return { newBookingId: newBooking.id }
}
