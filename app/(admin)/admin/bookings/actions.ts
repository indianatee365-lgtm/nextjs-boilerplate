"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendBookingConfirmation, sendBookingCancellationSms, sendBookingRescheduledSms } from "@/lib/telnyx/sms"
import { sendBookingConfirmationEmail, sendBookingCancellationEmail, sendBookingRescheduledEmail } from "@/lib/resend/email"
import Stripe from "stripe"
import { restoreHourCredits } from "@/lib/hour-credits"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}


export async function confirmBookingManually(bookingId: string) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select(`id, user_id, starts_at, ends_at, status, subtotal, tax, total, coupon_discount, membership_discount, gift_card_applied, bays(name), profiles!user_id(first_name, phone, sms_consent)`)
    .eq("id", bookingId)
    .single()

  const b = booking as {
    id: string; user_id: string; starts_at: string; ends_at: string; status: string
    subtotal: number; tax: number; total: number
    coupon_discount: number; membership_discount: number; gift_card_applied: number
    bays: { name: string } | null
    profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null
  } | null
  if (!b) throw new Error("Booking not found")
  if (b.status === "confirmed") return

  await serviceClient
    .from("bookings")
    .update({
      status: "confirmed",
      paid_at: new Date().toISOString(),
    })
    .eq("id", bookingId)

  if (b.profiles?.phone && b.profiles.sms_consent && b.bays) {
    try {
      await sendBookingConfirmation({
        to: b.profiles.phone,
        firstName: b.profiles.first_name,
        bayName: b.bays.name,
        startsAt: new Date(b.starts_at),
        endsAt: new Date(b.ends_at),
      })
    } catch (smsError) {
      console.error("SMS send failed", smsError)
    }
  }

  const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(b.user_id)
  if (authUser?.email && b.bays && b.profiles) {
    try {
      await sendBookingConfirmationEmail({
        to: authUser.email,
        firstName: b.profiles.first_name,
        bayName: b.bays.name,
        startsAt: new Date(b.starts_at),
        endsAt: new Date(b.ends_at),
        subtotal: Number(b.subtotal ?? 0),
        membershipDiscount: Number(b.membership_discount ?? 0),
        couponDiscount: Number(b.coupon_discount ?? 0),
        tax: Number(b.tax ?? 0),
        giftCardApplied: Number(b.gift_card_applied ?? 0),
        total: Number(b.total ?? 0),
      })
    } catch (emailError) {
      console.error("Confirmation email failed", emailError)
    }
  }
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
    .select(`
      id, status, total, starts_at, ends_at, user_id, stripe_payment_intent_id, stripe_charge_id,
      bays(name), profiles!user_id(first_name, phone, sms_consent)
    `)
    .eq("id", bookingId)
    .single()

  const b = booking as {
    id: string; status: string; total: number; starts_at: string; ends_at: string; user_id: string
    stripe_payment_intent_id: string | null; stripe_charge_id: string | null
    bays: { name: string } | null
    profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null
  } | null
  if (!b) throw new Error("Booking not found")
  if (b.status === "cancelled") return

  if (b.status === "pending" && b.stripe_payment_intent_id) {
    // Cancel the PaymentIntent so the customer can't complete payment after cancellation
    try {
      await getStripe().paymentIntents.cancel(b.stripe_payment_intent_id)
    } catch {
      // Already cancelled or captured, ignore
    }
  } else if (b.stripe_charge_id && Number(b.total) > 0) {
    // Issue Stripe refund for confirmed paid bookings
    await getStripe().refunds.create({
      charge: b.stripe_charge_id,
    })
  }

  // Only a paid, charged booking actually gets money back - a pending
  // booking's total was never captured, so telling that customer "refunded"
  // would be false even though b.total is nonzero.
  const refundIssued = Boolean(b.stripe_charge_id) && Number(b.total) > 0

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

  // Admin-initiated cancellations always return hour credits, unlike the customer
  // self-serve flow's 24h forfeit window: an operator cancelling on someone's
  // behalf is never the abuse case that window exists to prevent.
  const creditHoursRestored = await restoreHourCredits(serviceClient, bookingId)

  if (b.bays && b.profiles) {
    if (b.profiles.phone && b.profiles.sms_consent) {
      try {
        await sendBookingCancellationSms({
          to: b.profiles.phone,
          firstName: b.profiles.first_name,
          bayName: b.bays.name,
          startsAt: new Date(b.starts_at),
          endsAt: new Date(b.ends_at),
          refundAmount: refundIssued ? Number(b.total) : 0,
          creditHoursRestored,
        })
      } catch (smsError) {
        console.error("Cancellation SMS failed", smsError)
      }
    }

    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(b.user_id)
    if (authUser?.email) {
      try {
        await sendBookingCancellationEmail({
          to: authUser.email,
          firstName: b.profiles.first_name,
          bayName: b.bays.name,
          startsAt: new Date(b.starts_at),
          endsAt: new Date(b.ends_at),
          refundAmount: refundIssued ? Number(b.total) : 0,
          creditHoursRestored,
        })
      } catch (emailError) {
        console.error("Cancellation email failed", emailError)
      }
    }
  }
}

// Drag-and-drop move on the admin grid. Jerrod's call 2026-08-29: this is a
// staff convenience, not a customer-facing paid change - keeps the original
// price/credit/total exactly as they were, no repricing against the target
// slot's rate. Same-day only (the grid itself only ever renders one day, so
// there is no cross-date drop target); duration is preserved and computed
// server-side from duration_minutes rather than trusting a client-sent
// endsAt, so a drop can't accidentally shrink or stretch a booking.
export async function rescheduleBooking(bookingId: string, newBayId: string, newStartsAt: string) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  const { data: booking } = await serviceClient
    .from("bookings")
    .select(`
      id, status, duration_minutes, user_id,
      subtotal, membership_discount, coupon_discount, tax, gift_card_applied, credit_discount, total,
      bays(name), profiles!user_id(first_name, phone, sms_consent)
    `)
    .eq("id", bookingId)
    .single()

  const b = booking as {
    id: string; status: string; duration_minutes: number; user_id: string
    subtotal: number; membership_discount: number; coupon_discount: number; tax: number
    gift_card_applied: number; credit_discount: number; total: number
    bays: { name: string } | null
    profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null
  } | null
  if (!b) throw new Error("Booking not found")
  if (b.status === "cancelled") throw new Error("Cannot reschedule a cancelled booking")

  const newStart = new Date(newStartsAt)
  const newEnd = new Date(newStart.getTime() + b.duration_minutes * 60000)

  const { data: conflicts } = await serviceClient
    .from("bookings")
    .select("id")
    .eq("bay_id", newBayId)
    .in("status", ["pending", "confirmed"])
    .neq("id", bookingId)
    .lt("starts_at", newEnd.toISOString())
    .gt("ends_at", newStart.toISOString())

  if (conflicts?.length) {
    throw new Error("That time slot is already booked in the target bay.")
  }

  await serviceClient
    .from("bookings")
    .update({
      bay_id: newBayId,
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
    })
    .eq("id", bookingId)

  const { data: newBay } = await serviceClient.from("bays").select("name").eq("id", newBayId).single()
  const bayName = (newBay as { name: string } | null)?.name ?? b.bays?.name ?? "your bay"

  if (b.profiles) {
    if (b.profiles.phone && b.profiles.sms_consent) {
      try {
        await sendBookingRescheduledSms({
          to: b.profiles.phone,
          firstName: b.profiles.first_name,
          bayName,
          startsAt: newStart,
          endsAt: newEnd,
        })
      } catch (smsError) {
        console.error("Reschedule SMS failed", smsError)
      }
    }

    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(b.user_id)
    if (authUser?.email) {
      try {
        await sendBookingRescheduledEmail({
          to: authUser.email,
          firstName: b.profiles.first_name,
          bayName,
          startsAt: newStart,
          endsAt: newEnd,
          subtotal: Number(b.subtotal ?? 0),
          membershipDiscount: Number(b.membership_discount ?? 0),
          couponDiscount: Number(b.coupon_discount ?? 0),
          tax: Number(b.tax ?? 0),
          giftCardApplied: Number(b.gift_card_applied ?? 0),
          hourCreditDiscount: Number(b.credit_discount ?? 0),
          total: Number(b.total ?? 0),
        })
      } catch (emailError) {
        console.error("Reschedule email failed", emailError)
      }
    }
  }
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

export async function removeBlockedTime(id: string) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  await serviceClient.from("blocked_times").delete().eq("id", id)
}

// Used by BookingsManager's drag-to-move (bayId set) and drag-edge-to-resize
// (bayId omitted, same bay) interactions - no conflict checking against
// existing bookings, same as blockTime() above, since a block is staff-only
// and never customer-facing.
export async function updateBlockedTime(
  id: string,
  updates: { bayId?: string | null; startsAt: string; endsAt: string }
) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  const updateData: { starts_at: string; ends_at: string; bay_id?: string | null } = {
    starts_at: updates.startsAt,
    ends_at: updates.endsAt,
  }
  if (updates.bayId !== undefined) updateData.bay_id = updates.bayId

  await serviceClient.from("blocked_times").update(updateData).eq("id", id)
}
