import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { sendBookingConfirmation } from "@/lib/twilio/sms"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
}

function generateAccessCode(): string {
  // 6-digit numeric PIN
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error("Webhook signature verification failed", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const accessCode = generateAccessCode()

    // Update booking to confirmed
    const { data: booking } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        stripe_charge_id: paymentIntent.latest_charge as string,
        access_code: accessCode,
      })
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .select(`
        id, user_id, bay_id, starts_at, ends_at,
        coupon_id, gift_card_id, gift_card_applied,
        bays(name),
        profiles!user_id(first_name, phone)
      `)
      .single()

    if (!booking) {
      console.error("Booking not found for payment intent", paymentIntent.id)
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const profile = booking.profiles as { first_name: string; phone: string | null } | null
    const bay = booking.bays as { name: string } | null

    // Record coupon use
    if (booking.coupon_id) {
      await supabase.from("coupon_uses").insert({
        coupon_id: booking.coupon_id,
        user_id: booking.user_id,
        booking_id: booking.id,
      })
    }

    // Deduct gift card balance
    if (booking.gift_card_id && booking.gift_card_applied > 0) {
      const { data: giftCard } = await supabase
        .from("gift_cards")
        .select("balance")
        .eq("id", booking.gift_card_id)
        .single()

      if (giftCard) {
        const newBalance = Number(giftCard.balance) - Number(booking.gift_card_applied)
        await supabase
          .from("gift_cards")
          .update({ balance: newBalance, active: newBalance > 0 })
          .eq("id", booking.gift_card_id)

        await supabase.from("gift_card_transactions").insert({
          gift_card_id: booking.gift_card_id,
          booking_id: booking.id,
          amount: -Number(booking.gift_card_applied),
          balance_after: newBalance,
        })
      }
    }

    // Send SMS confirmation
    if (profile?.phone && bay) {
      try {
        await sendBookingConfirmation({
          to: profile.phone,
          firstName: profile.first_name,
          bayName: bay.name,
          startsAt: new Date(booking.starts_at),
          endsAt: new Date(booking.ends_at),
          accessCode,
        })

        await supabase
          .from("bookings")
          .update({ access_sent_at: new Date().toISOString() })
          .eq("id", booking.id)
      } catch (smsError) {
        // SMS failure should not block confirmation — log and continue
        console.error("SMS send failed", smsError)
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .eq("status", "pending")
  }

  // Membership subscription events
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number }
    const status = sub.status === "active" ? "active"
      : sub.status === "canceled" ? "cancelled"
      : sub.status === "past_due" ? "past_due"
      : "cancelled"

    const periodEnd = sub.current_period_end
      ?? (sub.items?.data?.[0] as any)?.current_period_end

    await supabase
      .from("memberships")
      .update({
        status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
      })
      .eq("stripe_subscription_id", sub.id)
  }

  return NextResponse.json({ received: true })
}
