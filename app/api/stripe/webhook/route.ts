import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { sendBookingConfirmation, sendAccessCodeReminder, sendBookingPaymentFailedSms, sendSubscriptionPastDueSms } from "@/lib/telnyx/sms"
import { sendBookingConfirmationEmail, sendGiftCardEmail, sendFounderConfirmationEmail, sendEagleConfirmationEmail, sendBookingPaymentFailedEmail, sendMembershipWelcomeEmail, sendSubscriptionPastDueEmail } from "@/lib/resend/email"
import { randomBytes } from "crypto"
import { grantBayAccess } from "@/lib/access-control"
import { logEvent, logFailure, notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { consumeHourCredits } from "@/lib/hour-credits"

function generateGiftCardCode(): string {
  return randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    // Log every failure; SMS at most once per hour (prevents flood when secret is wrong).
    // Real Stripe deliveries always include a stripe-signature header, so a missing header
    // means this wasn't Stripe (e.g. our own uptime healthcheck) - skip logging/paging
    // entirely for those instead of just skipping the page, so admin_logs isn't flooded
    // with an expected, harmless probe every 15 minutes.
    if (sig) {
      try {
        const sigClient = await createServiceClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: recentSig } = await (sigClient as any).from("admin_logs")
          .select("id", { count: "exact", head: true })
          .eq("event", "webhook-signature-FAILED")
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        await logEvent(sigClient, "webhook-signature-FAILED", `err=${String(err).slice(0, 200)} hadSigHeader=true`)
        if (!recentSig) {
          await notifyOwner(`ALERT Stripe webhook signature verification FAILED. Check STRIPE_WEBHOOK_SECRET in Vercel. Events will not retry until fixed.`)
        }
      } catch { /* never let logging crash the webhook */ }
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  if (event.type === "payment_intent.succeeded") {
    const _pi = event.data.object as Stripe.PaymentIntent
    if (_pi.metadata?.type === "reschedule") {
      const { originalBookingId, newStartsAt, newEndsAt, newBayId } = _pi.metadata
      await supabase.from("bookings").update({
        bay_id: newBayId,
        starts_at: newStartsAt,
        ends_at: newEndsAt,
      }).eq("id", originalBookingId).neq("status", "cancelled")
      return NextResponse.json({ received: true })
    }

    if (_pi.metadata?.type === "gift_card") {
      const { recipientName, recipientEmail, senderName, amountCents } = _pi.metadata
      const amount = parseInt(amountCents) / 100
      const code = generateGiftCardCode()
      const { error: insertError } = await supabase.from("gift_cards").insert({
        code, original_amount: amount, balance: amount, active: true,
        recipient_name: recipientName, recipient_email: recipientEmail,
        purchased_by: senderName, stripe_payment_id: _pi.id,
      })
      if (insertError && (insertError as { code?: string }).code !== "23505") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("admin_logs").insert({ event: "gift-card-insert-FAILED", detail: `pi=${_pi.id} to=${recipientEmail} amt=$${amount} err=${JSON.stringify(insertError).slice(0, 200)}` })
        await notifyOwner(`ALERT Gift card DB insert FAILED, pi=${_pi.id} to=${recipientEmail} $${amount}. Customer paid, fix immediately.`)
        return NextResponse.json({ received: true })
      }
      if (!insertError) {
        const emailErr = await sendGiftCardEmail({ recipientEmail, recipientName, senderName, code, amount }).then(() => null).catch((e: unknown) => String(e))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("admin_logs").insert({
          event: emailErr ? "gift-card-email-FAILED" : "gift-card-created",
          detail: emailErr
            ? `code=${code} to=${recipientEmail} amt=$${amount} err=${emailErr.slice(0, 200)}`
            : `code=${code} to=${recipientEmail} amt=$${amount} from=${senderName}`,
        })
        await notifyOwner(emailErr
          ? `ALERT Gift card email FAILED, code=${code} to=${recipientEmail} $${amount}. Send manually.`
          : `Gift card $${amount} from ${senderName} to ${recipientName} (code=${code})`)
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

      if (alreadyExists) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("admin_logs").insert({ event: "membership-duplicate-skipped", detail: `user=${user_id} pi=${_pi.id} plan=${plan_slug}` })
        return NextResponse.json({ received: true })
      }

      const paymentMethodId = _pi.payment_method as string | null
      const now = new Date()
      const trialEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

      const insertData: Record<string, unknown> = {
        user_id, plan_id,
        plan_type: plan_slug,
        status: "active",
        stripe_customer_id,
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
          .from("memberships").select("founder_number")
          .not("founder_number", "is", null)
          .order("founder_number", { ascending: false })
          .limit(1).maybeSingle()
        insertData.founder_number = ((maxRow as { founder_number: number } | null)?.founder_number ?? 0) + 1
        insertData.year_one_discount_expires_at = new Date("2027-09-01T03:59:59Z").toISOString()
        insertData.signup_bonus_hours = 2
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: memInsertErr } = await supabase.from("memberships").insert(insertData as any)
      if (memInsertErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("admin_logs").insert({ event: "membership-insert-FAILED", detail: `user=${user_id} plan=${plan_slug} pi=${_pi.id} err=${JSON.stringify(memInsertErr).slice(0, 200)}` })
        const custName = await getCustomerName(supabase, user_id)
        await notifyOwner(`ALERT Membership DB insert FAILED, ${custName} plan=${plan_slug} pi=${_pi.id}. Customer paid. Fix immediately.`)
        return NextResponse.json({ received: true })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("admin_logs").insert({ event: "membership-created", detail: `user=${user_id} plan=${plan_slug} founder#=${insertData.founder_number ?? "n/a"} pi=${_pi.id}` })
      await supabase.from("profiles").update({ stripe_customer_id }).eq("id", user_id)

      // Founders' 2-hour signup bonus is redeemed at Friends & Founders Day
      // (2026-08-29) or, if a founder can't get a slot that day, any later
      // date once general public booking opens - deliberately no expiry so
      // capacity or a scheduling conflict on 8/29 doesn't just forfeit the
      // benefit. signup_bonus_hours above is just a display promise on the
      // membership row - this is what actually makes it spendable via the
      // hour_credits ledger createBooking() checks.
      if (plan_slug === "founder") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: creditErr } = await (supabase as any).from("hour_credits").insert({
          user_id,
          hours: 2,
          hours_remaining: 2,
          reason: "Founders Day 2026",
          expires_at: null,
          active: true,
          created_by: user_id,
          redeemed_at: now.toISOString(),
        })
        if (creditErr) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("admin_logs").insert({ event: "founders-day-credit-FAILED", detail: `user=${user_id} err=${JSON.stringify(creditErr).slice(0, 200)}` })
        }
      }

      const founderTag = plan_slug === "founder" ? ` (#${String(insertData.founder_number)} of 100)` : ""

      await Promise.allSettled([
        stripe_price_id ? (async () => {
          try {
            if (paymentMethodId) {
              await getStripe().customers.update(stripe_customer_id, {
                invoice_settings: { default_payment_method: paymentMethodId },
              }).catch(() => {})
            }
            const subscription = await getStripe().subscriptions.create({
              customer: stripe_customer_id,
              items: [{ price: stripe_price_id }],
              trial_end: trialEnd,
              ...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
              metadata: { user_id, plan_id, plan_slug },
            })
            await supabase.from("memberships")
              .update({ stripe_subscription_id: subscription.id })
              .eq("user_id", user_id).eq("status", "active")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("admin_logs").insert({ event: "subscription-created", detail: `user=${user_id} sub=${subscription.id} plan=${plan_slug}` })
          } catch (subErr) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("admin_logs").insert({ event: "subscription-create-FAILED", detail: `user=${user_id} plan=${plan_slug} cust=${stripe_customer_id} err=${String(subErr).slice(0, 300)}` })
            const custName = await getCustomerName(supabase, user_id)
            await notifyOwner(`ALERT Sub create FAILED, ${plan_slug} ${custName}. NO recurring billing set up. Fix in Stripe manually.`)
          }
        })() : Promise.resolve(),

        (async () => {
          try {
            const [{ data: authUser }, { data: prof }] = await Promise.all([
              supabase.auth.admin.getUserById(user_id),
              supabase.from("profiles").select("first_name").eq("id", user_id).single(),
            ])
            const userEmail = authUser?.user?.email
            const firstName = (prof as { first_name: string } | null)?.first_name ?? "there"
            if (!userEmail) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from("admin_logs").insert({ event: "email-skipped-no-address", detail: `user=${user_id} plan=${plan_slug}` })
              const custName = await getCustomerName(supabase, user_id)
              await notifyOwner(`ALERT Welcome email SKIPPED, no email on file. ${custName} plan=${plan_slug}`)
              return
            }
            if (plan_slug === "founder") {
              await sendFounderConfirmationEmail({ to: userEmail, firstName, founderNumber: insertData.founder_number as number })
            } else if (plan_slug === "eagle") {
              await sendEagleConfirmationEmail({ to: userEmail, firstName })
            } else {
              // Any other plan (Birdie, or a future tier) - generic welcome
              // instead of silently sending nothing. sendResendEmail logs
              // its own email-sent/email-send-FAILED, so no manual log
              // needed here (the old manual log below used to fire even
              // when this branch had nothing to send at all - removed).
              const planName = plan_slug ? plan_slug.charAt(0).toUpperCase() + plan_slug.slice(1) : "Tee365"
              await sendMembershipWelcomeEmail({ to: userEmail, firstName, planName })
            }
          } catch (emailErr) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("admin_logs").insert({ event: "email-send-FAILED", detail: `user=${user_id} plan=${plan_slug} err=${String(emailErr).slice(0, 300)}` })
            const custName = await getCustomerName(supabase, user_id)
            await notifyOwner(`ALERT Welcome email FAILED, ${plan_slug} ${custName}. Send manually.`)
          }
        })(),

        (async () => {
          const custName = await getCustomerName(supabase, user_id)
          await notifyOwner(`New ${plan_slug} membership${founderTag}, ${custName}`)
        })(),
      ])

      return NextResponse.json({ received: true })
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent & { invoice?: string | null }

    // Subscription invoices are already handled by invoice.payment_succeeded
    if (paymentIntent.invoice) {
      return NextResponse.json({ received: true })
    }
    // Typed payments (reschedule, gift_card, membership) already handled above
    if (paymentIntent.metadata?.type) {
      return NextResponse.json({ received: true })
    }

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
        credit_hours_applied, credit_discount,
        bays(name),
        profiles!user_id(first_name, last_name, phone, sms_consent)
      `)
      .single()

    if (!booking) {
      console.error("Booking not found for payment intent", paymentIntent.id)
      return NextResponse.json({ received: true })
    }

    const profile = booking.profiles as { first_name: string; last_name: string; phone: string | null; sms_consent: boolean } | null
    const bay = booking.bays as { name: string } | null
    const b = booking as typeof booking & {
      subtotal: number; tax: number; total: number
      coupon_discount: number; membership_discount: number; gift_card_applied: number
      credit_hours_applied: number; credit_discount: number
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

    // Deduct hour credits (idempotent: webhook retries are guarded inside)
    if (Number(b.credit_hours_applied) > 0) {
      await consumeHourCredits(supabase, booking.user_id, booking.id, Number(b.credit_hours_applied))
    }

    // Send confirmation SMS: access code will be sent separately 15 min before session
    if (profile?.phone && profile.sms_consent && bay) {
      try {
        await sendBookingConfirmation({
          to: profile.phone,
          firstName: profile.first_name,
          bayName: bay.name,
          startsAt: new Date(booking.starts_at),
          endsAt: new Date(booking.ends_at),
        })
        await logEvent(supabase, "booking-confirmation-sms-sent", `booking=${booking.id} to=${profile.phone}`)
      } catch (smsError) {
        await logFailure(supabase, "booking-confirmation-sms-FAILED",
          `booking=${booking.id} to=${profile.phone} err=${String(smsError).slice(0, 200)}`)
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
          hourCreditDiscount: Number(b.credit_discount ?? 0),
        })
        await logEvent(supabase, "booking-confirmation-email-sent", `booking=${booking.id} to=${authUser.email}`)
      } catch (emailError) {
        await logFailure(supabase, "booking-confirmation-email-FAILED",
          `booking=${booking.id} to=${authUser.email} err=${String(emailError).slice(0, 200)}`)
      }
    }

    // If booking starts within 15 minutes, send access code immediately (CRITICAL path)
    const minutesUntilStart = (new Date(booking.starts_at).getTime() - Date.now()) / 60000
    if (minutesUntilStart <= 15 && profile?.phone && profile.sms_consent && bay) {
      try {
        const { pinCode, visitorId } = await grantBayAccess({
          bookingId: booking.id,
          firstName: profile.first_name,
          lastName:  profile.last_name ?? undefined,
          phone:     profile.phone,
          bayName:   bay.name,
          startsAt:  new Date(booking.starts_at),
          endsAt:    new Date(booking.ends_at),
        })
        await supabase.from("bookings").update({ access_code: pinCode }).eq("id", booking.id)
        await sendAccessCodeReminder({
          to: profile.phone,
          firstName: profile.first_name,
          bayName: bay.name,
          accessCode: pinCode,
          startsAt: new Date(booking.starts_at),
        })
        void visitorId  // TODO: save to bookings.unifi_visitor_id after DB migration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("bookings").update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() } as any).eq("id", booking.id)
        await logEvent(supabase, "access-code-sent-immediate", `booking=${booking.id} to=${profile.phone} starts_in_min=${minutesUntilStart.toFixed(1)}`)
      } catch (err) {
        await logFailure(supabase, "access-code-IMMEDIATE-FAILED",
          `booking=${booking.id} to=${profile.phone} starts_in_min=${minutesUntilStart.toFixed(1)} err=${String(err).slice(0, 200)}`,
          `ALERT Access code FAILED, booking=${booking.id} session starts in ${minutesUntilStart.toFixed(0)}min. Customer may be locked out. CALL THEM.`)
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent
    const piType = pi.metadata?.type
    const amount = ((pi.amount ?? 0) / 100).toFixed(2)
    const errMsg = pi.last_payment_error?.message ?? "no error message"

    if (piType === "membership") {
      const { user_id, plan_slug } = pi.metadata
      const custName = user_id ? await getCustomerName(supabase, user_id) : "unknown customer"
      await logFailure(supabase, "membership-payment-FAILED",
        `pi=${pi.id} user=${user_id} plan=${plan_slug} amount=$${amount} err=${errMsg}`,
        `ALERT Membership purchase FAILED, ${plan_slug ?? "?"} attempt by ${custName} $${amount}. Reason: ${errMsg}. Consider reaching out.`)
    } else if (piType === "gift_card") {
      const { recipientEmail, senderName } = pi.metadata
      await logFailure(supabase, "gift-card-payment-FAILED",
        `pi=${pi.id} to=${recipientEmail ?? "?"} from=${senderName ?? "?"} amount=$${amount} err=${errMsg}`,
        `ALERT Gift card purchase FAILED, ${senderName ?? "?"} tried $${amount} for ${recipientEmail ?? "?"}. Reason: ${errMsg}`)
    } else {
      // Booking: cancel the held slot, then tell the customer their slot was
      // released (not just log a trail - previously this branch notified
      // no one, customer or owner, so a failed booking payment silently
      // vanished the reservation).
      const { data: cancelledBooking } = await supabase
        .from("bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", pi.id)
        .eq("status", "pending")
        .select(`
          id, user_id, starts_at, ends_at,
          bays(name),
          profiles!user_id(first_name, phone, sms_consent)
        `)
        .maybeSingle()

      const failedBookingProfile = cancelledBooking?.profiles as { first_name: string; phone: string | null; sms_consent: boolean } | null
      const bookingCustName = failedBookingProfile?.first_name ?? (cancelledBooking ? `user=${cancelledBooking.user_id}` : "unknown customer")
      await logFailure(supabase, "booking-payment-FAILED",
        `pi=${pi.id} booking=${cancelledBooking?.id ?? "?"} amount=$${amount} err=${errMsg}`,
        `ALERT Booking payment FAILED, ${bookingCustName} $${amount}. Reason: ${errMsg}. Slot released automatically.`)

      if (cancelledBooking) {
        const bookingProfile = failedBookingProfile
        const bay = cancelledBooking.bays as { name: string } | null
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(cancelledBooking.user_id)

        if (bay && bookingProfile?.phone && bookingProfile.sms_consent) {
          try {
            await sendBookingPaymentFailedSms({
              to: bookingProfile.phone,
              firstName: bookingProfile.first_name,
              bayName: bay.name,
              startsAt: new Date(cancelledBooking.starts_at),
            })
          } catch (err) {
            await logFailure(supabase, "booking-payment-failed-sms-FAILED",
              `booking=${cancelledBooking.id} to=${bookingProfile.phone} err=${String(err).slice(0, 200)}`)
          }
        }

        if (bay && authUser?.email && bookingProfile) {
          try {
            await sendBookingPaymentFailedEmail({
              to: authUser.email,
              firstName: bookingProfile.first_name,
              bayName: bay.name,
              startsAt: new Date(cancelledBooking.starts_at),
            })
          } catch (err) {
            await logFailure(supabase, "booking-payment-failed-email-FAILED",
              `booking=${cancelledBooking.id} to=${authUser.email} err=${String(err).slice(0, 200)}`)
          }
        }
      }
    }
  }

  // Membership signup: create the membership record on first successful invoice payment
  // invoice.payment_succeeded: observational only.
  // Membership creation is owned by payment_intent.succeeded. Renewals extend current_period_end
  // via customer.subscription.updated. We log here for an audit trail.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice & { billing_reason?: string; subscription?: string; customer?: string; amount_paid?: number }
    const subId = invoice.subscription as string | undefined
    const custId = invoice.customer as string | undefined
    const amount = ((invoice.amount_paid ?? 0) / 100).toFixed(2)
    let userInfo = "unknown"
    // Try subscription ID first, fall back to customer ID if not found
    {
      type MemberRow = { user_id?: string; plan_type?: string; profiles?: { first_name?: string; last_name?: string } | null } | null
      let mm: MemberRow = null
      if (subId) {
        const { data } = await supabase
          .from("memberships")
          .select("user_id, plan_type, profiles(first_name, last_name)")
          .eq("stripe_subscription_id", subId)
          .maybeSingle()
        mm = data as MemberRow
      }
      if (!mm?.user_id && custId) {
        const { data } = await supabase
          .from("memberships")
          .select("user_id, plan_type, profiles(first_name, last_name)")
          .eq("stripe_customer_id", custId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        mm = data as MemberRow
      }
      if (mm?.user_id) {
        const name = [mm.profiles?.first_name, mm.profiles?.last_name].filter(Boolean).join(" ") || mm.user_id
        userInfo = `${mm.plan_type ?? "?"} – ${name}`
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("admin_logs").insert({
      event: `invoice-paid-${invoice.billing_reason ?? "unknown"}`,
      detail: `${userInfo} sub=${subId ?? "?"} amount=$${amount}`,
    })
    if (invoice.billing_reason === "subscription_cycle") {
      await notifyOwner(`Renewal succeeded, ${userInfo} $${amount}.`)
    }
  }

  // Renewal failures: alert immediately so we don't find out from a customer
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string; customer?: string; amount_due?: number; attempt_count?: number; next_payment_attempt?: number }
    const subId = invoice.subscription as string | undefined
    const custId = invoice.customer as string | undefined
    const amountDue = ((invoice.amount_due ?? 0) / 100).toFixed(2)
    const nextAttempt = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000).toISOString().slice(0, 16) : "none"

    let userInfo = "unknown"
    {
      type MemberRow = { user_id?: string; plan_type?: string; profiles?: { first_name?: string; last_name?: string } | null } | null
      let mm: MemberRow = null
      if (subId) {
        const { data } = await supabase
          .from("memberships")
          .select("user_id, plan_type, profiles(first_name, last_name)")
          .eq("stripe_subscription_id", subId)
          .maybeSingle()
        mm = data as MemberRow
      }
      if (!mm?.user_id && custId) {
        const { data } = await supabase
          .from("memberships")
          .select("user_id, plan_type, profiles(first_name, last_name)")
          .eq("stripe_customer_id", custId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        mm = data as MemberRow
      }
      if (mm?.user_id) {
        const name = [mm.profiles?.first_name, mm.profiles?.last_name].filter(Boolean).join(" ") || mm.user_id
        userInfo = `${mm.plan_type ?? "?"} – ${name}`
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("admin_logs").insert({
      event: "invoice-payment-FAILED",
      detail: `${userInfo} sub=${subId ?? "?"} amount=$${amountDue} attempt=${invoice.attempt_count ?? 0} next=${nextAttempt}`,
    })
    await notifyOwner(`ALERT Renewal charge FAILED, ${userInfo} $${amountDue} (attempt ${invoice.attempt_count ?? "?"}). Stripe will retry ${nextAttempt}.`)
  }

  // Subscription status changes (renewals, cancellations, recoveries)
  const PLAN_DISPLAY_NAMES: Record<string, string> = {
    founder: "Founder's Club",
    eagle: "Eagle",
    birdie: "Birdie",
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number }
    const newStatus = sub.status === "active" ? "active"
      : sub.status === "canceled" ? "cancelled"
      : sub.status === "past_due" ? "past_due"
      : "cancelled"

    const periodEnd = sub.current_period_end
      ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end

    // Look up current state BEFORE we update, so we know what changed
    const { data: existing } = await supabase
      .from("memberships")
      .select("user_id, plan_type, status")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle()
    const prev = existing as { user_id?: string; plan_type?: string; status?: string } | null
    const prevStatus = prev?.status
    const userId = prev?.user_id ?? "unknown"
    const planType = prev?.plan_type ?? "unknown"

    await supabase
      .from("memberships")
      .update({
        status: newStatus,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
      })
      .eq("stripe_subscription_id", sub.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("admin_logs").insert({
      event: `subscription-${event.type === "customer.subscription.deleted" ? "deleted" : "updated"}`,
      detail: `sub=${sub.id} user=${userId} plan=${planType} status=${prevStatus ?? "?"} -> ${newStatus}`,
    })

    // Alert ONLY when transitioning into a problem state (avoid repeat-alerts on every Stripe update)
    if (newStatus === "past_due" && prevStatus !== "past_due") {
      const custName = await getCustomerName(supabase, userId)
      await notifyOwner(`ALERT Subscription PAST DUE, ${planType} ${custName}. Card declined on renewal. Stripe is dunning.`)

      if (userId !== "unknown") {
        const { data: pastDueProfile } = await supabase
          .from("profiles")
          .select("first_name, phone, sms_consent")
          .eq("id", userId)
          .maybeSingle()
        const pdProfile = pastDueProfile as { first_name: string; phone: string | null; sms_consent: boolean } | null
        const planDisplayName = PLAN_DISPLAY_NAMES[planType] ?? planType

        if (pdProfile?.phone && pdProfile.sms_consent) {
          try {
            await sendSubscriptionPastDueSms({ to: pdProfile.phone, firstName: pdProfile.first_name, planDisplayName })
          } catch (err) {
            await logFailure(supabase, "subscription-past-due-sms-FAILED",
              `user=${userId} to=${pdProfile.phone} err=${String(err).slice(0, 200)}`)
          }
        }

        const { data: { user: pastDueAuthUser } } = await supabase.auth.admin.getUserById(userId)
        if (pastDueAuthUser?.email && pdProfile) {
          try {
            await sendSubscriptionPastDueEmail({ to: pastDueAuthUser.email, firstName: pdProfile.first_name, planDisplayName })
          } catch (err) {
            await logFailure(supabase, "subscription-past-due-email-FAILED",
              `user=${userId} to=${pastDueAuthUser.email} err=${String(err).slice(0, 200)}`)
          }
        }
      }
    } else if (newStatus === "cancelled" && prevStatus !== "cancelled") {
      const custName = await getCustomerName(supabase, userId)
      await notifyOwner(`ALERT Subscription CANCELLED, ${planType} ${custName}.`)
    } else if (newStatus === "active" && prevStatus === "past_due") {
      const custName = await getCustomerName(supabase, userId)
      await notifyOwner(`Sub RECOVERED, ${planType} ${custName} back to active.`)
    }
  }

  // Gift card purchase: backup in case success page wasn't reached
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

  // A customer confirmed adding a new card (account page "Add a card" flow,
  // or any future setup-intent entry point). Stripe attaches the payment
  // method to the customer automatically on confirmation, but never makes
  // it the customer's default for subscription renewals unless told to -
  // without this, a member fixing a declined card here would still have
  // Stripe's dunning retry hit the OLD card.
  if (event.type === "setup_intent.succeeded") {
    const setupIntent = event.data.object as Stripe.SetupIntent
    const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id
    const paymentMethodId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id

    if (customerId && paymentMethodId) {
      try {
        await getStripe().customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("admin_logs").insert({
          event: "default-payment-method-updated",
          detail: `customer=${customerId} pm=${paymentMethodId} setup_intent=${setupIntent.id}`,
        })
      } catch (err) {
        await logFailure(supabase, "default-payment-method-update-FAILED",
          `customer=${customerId} pm=${paymentMethodId} err=${String(err).slice(0, 200)}`)
      }
    }
  }

  return NextResponse.json({ received: true })
}
