import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { sendBookingConfirmation } from "@/lib/telnyx/sms"
import { sendBookingConfirmationEmail, sendGiftCardEmail } from "@/lib/resend/email"
import { randomBytes } from "crypto"

function generateGiftCardCode(): string {
  return randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
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
    const _pi = event.data.object as Stripe.PaymentIntent
    if (_pi.metadata?.type === "gift_card") {
      const { recipientName, recipientEmail, senderName, amountCents } = _pi.metadata
      const amount = parseInt(amountCents) / 100
      const code = generateGiftCardCode()
      const { error: insertError } = await supabase.from("gift_cards").insert({
        code, original_amount: amount, balance: amount, active: true,
        recipient_name: recipientName, recipient_email: recipientEmail,
        purchased_by: senderName, stripe_payment_id: _pi.id,
      })
      if (!insertError) {
        try { await sendGiftCardEmail({ recipientEmail, recipientName, senderName, code, amount }) } catch {}
      } else if ((insertError as { code?: string }).code !== "23505") {
        console.error("Gift card webhook insert failed", insertError)
      }
      return NextResponse.json({ received: true })
    }

    if (_pi.metadata?.type === "membership") {
      const { user_id, plan_id, plan_slug, stripe_customer_id, stripe_price_id } = _pi.metadata

      const { data: alreadyExists } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user_id)
        .in("status", ["active", "pending_opening"])
        .maybeSingle()

      if (!alreadyExists && stripe_price_id) {
        const paymentMethodId = _pi.payment_method as string | null
        if (paymentMethodId) {
          await getStripe().customers.update(stripe_customer_id, {
            invoice_settings: { default_payment_method: paymentMethodId },
          }).catch(() => {})
        }

        // First month already paid — subscription starts billing after 30-day trial
        const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        const subscription = await getStripe().subscriptions.create({
          customer: stripe_customer_id,
          items: [{ price: stripe_price_id }],
          trial_end: trialEnd,
          ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
          metadata: { user_id, plan_id, plan_slug },
        })

        const now = new Date()
        const insertData: Record<string, unknown> = {
          user_id,
          plan_id,
          plan_type: plan_slug,
          status: "active",
          stripe_customer_id,
          stripe_subscription_id: subscription.id,
          started_at: now.toISOString(),
          current_period_end: new Date(trialEnd * 1000).toISOString(),
          joining_fee_paid: plan_slug === "founder",
          joining_fee_paid_at: plan_slug === "founder" ? now.toISOString() : null,
        }

        if (plan_slug === "eagle") {
          insertData.signup_bonus_hours = 2
          const bonusExpiry = new Date(now)
          bonusExpiry.setDate(bonusExpiry.getDate() + 90)
          insertData.signup_bonus_expires_at = bonusExpiry.toISOString()
        }

        if (plan_slug === "founder") {
          const { data: maxRow } = await supabase
            .from("memberships")
            .select("founder_number")
            .not("founder_number", "is", null)
            .order("founder_number", { ascending: false })
            .limit(1)
            .maybeSingle()
          insertData.founder_number =
            ((maxRow as { founder_number: number } | null)?.founder_number ?? 0) + 1
          insertData.year_one_discount_expires_at = new Date("2027-08-31T23:59:59Z").toISOString()
          insertData.signup_bonus_hours = 2
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("memberships").insert(insertData as any)
      }

      return NextResponse.json({ received: true })
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent

    const { data: booking } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        stripe_charge_id: paymentIntent.latest_charge as string,
      })
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .neq("status", "cancelled")
      .select(`
        id, user_id, bay_id, starts_at, ends_at,
        subtotal, tax, total, coupon_discount, membership_discount,
        coupon_id, gift_card_id, gift_card_applied,
        bays(name),
        profiles!user_id(first_name, last_name, phone)
      `)
      .single()

    if (!booking) {
      console.error("Booking not found for payment intent", paymentIntent.id)
      return NextResponse.json({ error: "Booking not found" }, { status: 404 })
    }

    const profile = booking.profiles as { first_name: string; last_name: string; phone: string | null } | null
    const bay = booking.bays as { name: string } | null
    const b = booking as typeof booking & {
      subtotal: number; tax: number; total: number
      coupon_discount: number; membership_discount: number; gift_card_applied: number
    }

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

    // Send confirmation SMS — access code will be sent separately 15 min before session
    if (profile?.phone && bay) {
      try {
        await sendBookingConfirmation({
          to: profile.phone,
          firstName: profile.first_name,
          bayName: bay.name,
          startsAt: new Date(booking.starts_at),
          endsAt: new Date(booking.ends_at),
        })
      } catch (smsError) {
        console.error("SMS send failed", smsError)
      }
    }

    // Send confirmation email with receipt
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(booking.user_id)
    if (authUser?.email && bay && profile) {
      try {
        await sendBookingConfirmationEmail({
          to: authUser.email,
          firstName: profile.first_name,
          bayName: bay.name,
          startsAt: new Date(booking.starts_at),
          endsAt: new Date(booking.ends_at),
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

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .eq("status", "pending")
  }

  // Membership signup — create the membership record on first successful invoice payment
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice & { billing_reason?: string; subscription?: string; customer?: string }

    // Only handle the initial subscription creation invoice, not renewals
    if (invoice.billing_reason === "subscription_create" && invoice.subscription) {
      const subscriptionId = invoice.subscription as string
      const sub = await getStripe().subscriptions.retrieve(subscriptionId) as unknown as Stripe.Subscription & { current_period_end: number }
      const { user_id, plan_id, plan_slug } = sub.metadata ?? {}

      if (user_id && plan_id) {
        // Idempotency check
        const { data: alreadyExists } = await supabase
          .from("memberships")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle()

        if (!alreadyExists) {
          const now = new Date()
          const insertData: Record<string, unknown> = {
            user_id,
            plan_id,
            plan_type: plan_slug ?? "birdie",
            status: "active",
            stripe_customer_id: invoice.customer as string,
            stripe_subscription_id: subscriptionId,
            started_at: now.toISOString(),
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            joining_fee_paid: plan_slug === "founder",
            joining_fee_paid_at: plan_slug === "founder" ? now.toISOString() : null,
          }

          if (plan_slug === "eagle") {
            insertData.signup_bonus_hours = 2
            const bonusExpiry = new Date(now)
            bonusExpiry.setDate(bonusExpiry.getDate() + 90)
            insertData.signup_bonus_expires_at = bonusExpiry.toISOString()
          }

          if (plan_slug === "founder") {
            const { data: maxRow } = await supabase
              .from("memberships")
              .select("founder_number")
              .not("founder_number", "is", null)
              .order("founder_number", { ascending: false })
              .limit(1)
              .maybeSingle()

            insertData.founder_number = ((maxRow as { founder_number: number } | null)?.founder_number ?? 0) + 1
            insertData.year_one_discount_expires_at = new Date("2027-08-31T23:59:59Z").toISOString()
            insertData.signup_bonus_hours = 2
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await supabase.from("memberships").insert(insertData as any)
        }
      }
    }
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

  // Gift card purchase — backup in case success page wasn't reached
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.metadata?.type === "gift_card" && session.payment_status === "paid") {
      const { recipientName, recipientEmail, senderName, amountCents } = session.metadata
      const stripePaymentId = session.payment_intent as string
      const amount = parseInt(amountCents) / 100

      const { data: existing } = await supabase
        .from("gift_cards").select("id").eq("stripe_payment_id", stripePaymentId).single()

      if (!existing) {
        const code = generateGiftCardCode()
        await supabase.from("gift_cards").insert({
          code, original_amount: amount, balance: amount, active: true,
          recipient_name: recipientName, recipient_email: recipientEmail,
          purchased_by: senderName, stripe_payment_id: stripePaymentId,
        })
        try {
          await sendGiftCardEmail({ recipientEmail, recipientName, senderName, code, amount })
        } catch (err) {
          console.error("Gift card email failed (webhook)", err)
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
