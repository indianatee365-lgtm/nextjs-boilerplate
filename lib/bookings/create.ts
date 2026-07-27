import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import Stripe from "stripe"
import { sendBookingConfirmation, sendAccessCodeReminder } from "@/lib/telnyx/sms"
import { sendBookingConfirmationEmail } from "@/lib/resend/email"
import { grantBayAccess } from "@/lib/access-control"
import { isInFirstYear } from "@/lib/membership/first-year"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { getAvailableHourCredits, sumCreditHours, consumeHourCredits } from "@/lib/hour-credits"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export interface CreateBookingInput {
  serviceClient: SupabaseClient
  userId: string
  bayId: string
  startsAt: string
  durationMinutes: number
  couponCode?: string
  giftCardCode?: string
  disclosureIds?: string[]
  applyHourCredits?: boolean
  // "web" bookings go through the site's session-authenticated flow; "phone"
  // bookings are created by the voice agent on the caller's behalf. Both are
  // gated by the same pre-launch admin-only check below.
  source?: "web" | "phone"
}

export type CreateBookingResult =
  | {
      ok: true
      bookingId: string
      clientSecret: string | null
      pricing: ReturnType<typeof calculateBookingPrice>
      bay: { id: string; number: number; name: string }
      startsAt: string
      endsAt: string
    }
  | { ok: false; status: number; error: string }

// Moved out of app/api/bookings/route.ts so both the website's session-based
// flow and the phone agent's webhook (which has no session cookie to hit
// that route with) can create a real booking through the exact same
// pricing/conflict/payment logic. The pre-launch admin-only gate lives here
// now instead of just the HTTP route, so it can't be bypassed by adding a
// new caller that skips the route.
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  const {
    serviceClient,
    userId,
    bayId,
    startsAt,
    durationMinutes,
    couponCode,
    giftCardCode,
    disclosureIds,
    applyHourCredits,
    source = "web",
  } = input

  // Booking window gate: admin only until September 2026
  const { data: callerProfile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()
  if ((callerProfile as { role: string } | null)?.role !== "admin") {
    return { ok: false, status: 403, error: "Bookings not yet available" }
  }

  if (!bayId || !startsAt || !durationMinutes) {
    return { ok: false, status: 400, error: "Missing required fields" }
  }

  if (durationMinutes < 60 || durationMinutes > 240 || durationMinutes % 30 !== 0) {
    return { ok: false, status: 400, error: "Invalid duration" }
  }

  const startDate = new Date(startsAt)
  if (startDate.getTime() < Date.now() - 60000) {
    return { ok: false, status: 400, error: "Booking start time must be in the future" }
  }
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

  // Check bay exists
  const { data: bay } = await serviceClient
    .from("bays")
    .select("id, number, name")
    .eq("id", bayId)
    .eq("active", true)
    .single()

  if (!bay) return { ok: false, status: 404, error: "Bay not found" }

  // Check for conflicts
  const { data: conflicts } = await serviceClient
    .from("bookings")
    .select("id")
    .eq("bay_id", bayId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", endDate.toISOString())
    .gt("ends_at", startDate.toISOString())

  if (conflicts && conflicts.length > 0) {
    return { ok: false, status: 409, error: "Bay is not available for this time" }
  }

  // Check blocked times
  const { data: blocked } = await serviceClient
    .from("blocked_times")
    .select("id")
    .or(`bay_id.eq.${bayId},bay_id.is.null`)
    .lt("starts_at", endDate.toISOString())
    .gt("ends_at", startDate.toISOString())

  if (blocked && blocked.length > 0) {
    return { ok: false, status: 409, error: "Bay is blocked during this time" }
  }

  // Get pricing rules
  const { data: pricingRules } = await serviceClient
    .from("pricing_rules")
    .select("season_type, day_type, time_type, price_per_hour")

  const rulesMap: Record<string, number> = {}
  for (const rule of pricingRules ?? []) {
    rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
  }

  const context = getPricingContext(startDate)
  const key = `${context.seasonType}|${context.dayType}|${context.timeType}`
  const pricePerHour = rulesMap[key] ?? 0

  // Get user's active membership
  const { data: membership } = await serviceClient
    .from("memberships")
    .select("id, plan_id, started_at, year_one_discount_expires_at, membership_plans(slug, discount_percent, first_year_discount)")
    .eq("user_id", userId)
    .eq("status", "active")
    .single()

  let membershipDiscountPercent = 0
  let membershipId: string | null = null

  if (membership) {
    membershipId = membership.id
    const plan = membership.membership_plans as { slug: string; discount_percent: number; first_year_discount: number | null } | null
    if (plan) {
      const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null })
      membershipDiscountPercent =
        isFirstYear && plan.first_year_discount != null
          ? plan.first_year_discount
          : plan.discount_percent
    }
  }

  // Validate coupon
  let couponId: string | null = null
  let couponDiscountType: "percent" | "fixed" | undefined
  let couponDiscountValue = 0

  if (couponCode) {
    const { data: coupon } = await serviceClient
      .from("coupons")
      .select("id, discount_type, discount_value, max_uses, uses_count, expires_at, max_uses_per_user")
      .eq("code", couponCode.toUpperCase())
      .eq("active", true)
      .single()

    if (!coupon) return { ok: false, status: 400, error: "Invalid coupon code" }
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return { ok: false, status: 400, error: "Coupon has expired" }
    }
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return { ok: false, status: 400, error: "Coupon has reached its usage limit" }
    }

    const c = coupon as typeof coupon & { max_uses_per_user: number | null }
    if (c.max_uses_per_user !== null) {
      const { count } = await serviceClient
        .from("coupon_uses")
        .select("id", { count: "exact", head: true })
        .eq("coupon_id", coupon.id)
        .eq("user_id", userId)
      if ((count ?? 0) >= c.max_uses_per_user) {
        return { ok: false, status: 400, error: "You have already used this coupon" }
      }
    }
    couponId = coupon.id
    couponDiscountType = coupon.discount_type as "percent" | "fixed"
    couponDiscountValue = Number(coupon.discount_value)
  }

  // Validate gift card
  let giftCardId: string | null = null
  let giftCardBalance = 0

  if (giftCardCode) {
    const { data: giftCard } = await serviceClient
      .from("gift_cards")
      .select("id, balance, expires_at")
      .eq("code", giftCardCode.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-"))
      .eq("active", true)
      .single()

    if (!giftCard) return { ok: false, status: 400, error: "Invalid gift card code" }
    if (giftCard.expires_at && new Date(giftCard.expires_at) < new Date()) {
      return { ok: false, status: 400, error: "Gift card has expired" }
    }
    if (Number(giftCard.balance) <= 0) {
      return { ok: false, status: 400, error: "Gift card has no remaining balance" }
    }

    giftCardId = giftCard.id
    giftCardBalance = Number(giftCard.balance)
  }

  // Hour credits: applied automatically when the client opts in (default in the UI)
  let creditHours = 0
  if (applyHourCredits === true) {
    const credits = await getAvailableHourCredits(serviceClient, userId)
    creditHours = Math.min(sumCreditHours(credits), durationMinutes / 60)
  }

  // Calculate price
  const pricing = calculateBookingPrice({
    pricePerHour,
    durationMinutes,
    membershipDiscountPercent,
    couponDiscountType,
    couponDiscountValue,
    giftCardBalance,
    creditHours,
    context,
  })

  // Guard against zero/sub-minimum amounts
  const amountCents = Math.round(pricing.total * 100)

  // $0 booking: gift card covers the full amount; skip Stripe entirely
  if (amountCents === 0) {
    const { data: booking, error: bookingError } = await serviceClient
      .from("bookings")
      .insert({
        user_id: userId,
        bay_id: bayId,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
        status: "confirmed",
        price_per_hour: pricePerHour,
        subtotal: pricing.subtotal,
        membership_discount: pricing.membershipDiscount,
        coupon_discount: pricing.couponDiscount,
        tax: pricing.tax,
        gift_card_applied: pricing.giftCardApplied,
        credit_hours_applied: pricing.creditHoursApplied,
        credit_discount: pricing.creditDiscount,
        total: pricing.total,
        membership_id: membershipId,
        coupon_id: couponId,
        gift_card_id: giftCardId,
        stripe_payment_intent_id: null,
        paid_at: new Date().toISOString(),
        source,
      })
      .select()
      .single()

    if (bookingError || !booking) {
      return { ok: false, status: 500, error: "Failed to create booking" }
    }

    // Disclosures
    if (Array.isArray(disclosureIds) && disclosureIds.length > 0) {
      const { data: disclosureBodies } = await serviceClient
        .from("disclosures").select("id, body").in("id", disclosureIds)
      const bodyMap = Object.fromEntries((disclosureBodies ?? []).map((d: { id: string; body: string }) => [d.id, d.body]))
      await serviceClient.from("disclosure_acknowledgments").upsert(
        disclosureIds.map((id: string) => ({
          user_id: userId, disclosure_id: id, booking_id: booking.id,
          body_snapshot: bodyMap[id] ?? null,
        })),
        { onConflict: "user_id,disclosure_id" }
      )
    }

    // Record coupon use
    if (couponId) {
      await serviceClient.from("coupon_uses").insert({
        coupon_id: couponId, user_id: userId, booking_id: booking.id,
      })
    }

    // Deduct hour credits (paid bookings do this in the Stripe webhook instead)
    if (pricing.creditHoursApplied > 0) {
      await consumeHourCredits(serviceClient, userId, booking.id, pricing.creditHoursApplied)
    }

    // Deduct gift card balance
    if (giftCardId && pricing.giftCardApplied > 0) {
      const { data: gc } = await serviceClient
        .from("gift_cards").select("balance").eq("id", giftCardId).single()
      if (gc) {
        const newBalance = Number(gc.balance) - pricing.giftCardApplied
        await serviceClient.from("gift_cards")
          .update({ balance: newBalance, active: newBalance > 0 }).eq("id", giftCardId)
        await serviceClient.from("gift_card_transactions").insert({
          gift_card_id: giftCardId, booking_id: booking.id,
          amount: -pricing.giftCardApplied, balance_after: newBalance,
        })
      }
    }

    // Fetch profile for notifications
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("first_name, last_name, phone, sms_consent")
      .eq("id", userId)
      .single()
    const p = profile as { first_name: string; last_name: string; phone: string | null; sms_consent: boolean } | null

    if (p?.phone && p.sms_consent) {
      try {
        await sendBookingConfirmation({
          to: p.phone, firstName: p.first_name, bayName: bay.name,
          startsAt: startDate, endsAt: endDate,
        })
        await logEvent(serviceClient, "booking-confirmation-sms-sent", `booking=${booking.id} to=${p.phone} path=free source=${source}`)
      } catch (e) {
        await logFailure(serviceClient, "booking-confirmation-sms-FAILED",
          `booking=${booking.id} to=${p.phone} path=free source=${source} err=${String(e).slice(0, 200)}`)
      }
    }

    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(userId)
    if (authUser?.email && p) {
      try {
        await sendBookingConfirmationEmail({
          to: authUser.email, firstName: p.first_name, bayName: bay.name,
          startsAt: startDate, endsAt: endDate,
          subtotal: pricing.subtotal, membershipDiscount: pricing.membershipDiscount,
          couponDiscount: pricing.couponDiscount, tax: pricing.tax,
          giftCardApplied: pricing.giftCardApplied, total: pricing.total,
          hourCreditDiscount: pricing.creditDiscount,
        })
        await logEvent(serviceClient, "booking-confirmation-email-sent", `booking=${booking.id} to=${authUser.email} path=free source=${source}`)
      } catch (e) {
        await logFailure(serviceClient, "booking-confirmation-email-FAILED",
          `booking=${booking.id} to=${authUser.email} path=free source=${source} err=${String(e).slice(0, 200)}`)
      }
    }

    // If session starts within 15 min, send access code immediately
    const minsUntil = (startDate.getTime() - Date.now()) / 60000
    if (minsUntil <= 15 && p?.phone && p.sms_consent) {
      try {
        const { pinCode, visitorId } = await grantBayAccess({
          bookingId: booking.id,
          firstName: p.first_name ?? "Customer",
          lastName:  p.last_name  ?? undefined,
          phone:     p.phone,
          bayName:   bay.name,
          startsAt:  startDate,
          endsAt:    endDate,
        })
        await serviceClient.from("bookings").update({ access_code: pinCode }).eq("id", booking.id)
        await sendAccessCodeReminder({ to: p.phone, firstName: p.first_name, bayName: bay.name, accessCode: pinCode, startsAt: startDate })
        void visitorId  // TODO: save to bookings.unifi_visitor_id after DB migration
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await serviceClient.from("bookings").update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() } as any).eq("id", booking.id)
        await logEvent(serviceClient, "access-code-sent-immediate", `booking=${booking.id} to=${p.phone} starts_in_min=${minsUntil.toFixed(1)} path=free source=${source}`)
      } catch (e) {
        await logFailure(serviceClient, "access-code-IMMEDIATE-FAILED",
          `booking=${booking.id} to=${p.phone} starts_in_min=${minsUntil.toFixed(1)} path=free source=${source} err=${String(e).slice(0, 200)}`,
          `ALERT Access code FAILED, booking=${booking.id} session starts in ${minsUntil.toFixed(0)}min. Customer may be locked out. CALL THEM.`)
      }
    }

    return {
      ok: true,
      bookingId: booking.id,
      clientSecret: null,
      pricing,
      bay,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
    }
  }

  if (amountCents < 50) {
    return { ok: false, status: 400, error: "Something went wrong calculating your total. Please contact us at info@tee365.org." }
  }

  // Retrieve or create a Stripe Customer so the payment method is saved for future use
  const { data: profileForStripe } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id, first_name, last_name")
    .eq("id", userId)
    .single()

  let stripeCustomerId = (profileForStripe as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    const { data: authUser } = await serviceClient.auth.admin.getUserById(userId)
    const customer = await getStripe().customers.create({
      email: authUser.user?.email ?? undefined,
      name: profileForStripe
        ? `${(profileForStripe as { first_name: string }).first_name} ${(profileForStripe as { last_name: string }).last_name}`.trim()
        : undefined,
      metadata: { supabase_user_id: userId },
    })
    stripeCustomerId = customer.id
    await serviceClient.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", userId)
  }

  // Create Stripe PaymentIntent: setup_future_usage saves the card on file for future charges
  const paymentIntent = await getStripe().paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    payment_method_types: ["card", "cashapp"],
    customer: stripeCustomerId,
    setup_future_usage: "off_session",
    metadata: {
      userId,
      bayId,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      durationMinutes: String(durationMinutes),
    },
  })

  // Create booking in pending state
  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .insert({
      user_id: userId,
      bay_id: bayId,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      duration_minutes: durationMinutes,
      status: "pending",
      price_per_hour: pricePerHour,
      subtotal: pricing.subtotal,
      membership_discount: pricing.membershipDiscount,
      coupon_discount: pricing.couponDiscount,
      tax: pricing.tax,
      gift_card_applied: pricing.giftCardApplied,
      credit_hours_applied: pricing.creditHoursApplied,
      credit_discount: pricing.creditDiscount,
      total: pricing.total,
      membership_id: membershipId,
      coupon_id: couponId,
      gift_card_id: giftCardId,
      stripe_payment_intent_id: paymentIntent.id,
      source,
    })
    .select()
    .single()

  if (bookingError || !booking) {
    await getStripe().paymentIntents.cancel(paymentIntent.id)
    return { ok: false, status: 500, error: `Failed to create booking: ${bookingError?.message ?? "unknown"}` }
  }

  // Record disclosure acknowledgments with body snapshot for audit trail
  if (Array.isArray(disclosureIds) && disclosureIds.length > 0) {
    const { data: disclosureBodies } = await serviceClient
      .from("disclosures")
      .select("id, body")
      .in("id", disclosureIds)
    const bodyMap = Object.fromEntries((disclosureBodies ?? []).map((d: { id: string; body: string }) => [d.id, d.body]))
    await serviceClient.from("disclosure_acknowledgments").upsert(
      disclosureIds.map((id: string) => ({
        user_id: userId,
        disclosure_id: id,
        booking_id: booking.id,
        body_snapshot: bodyMap[id] ?? null,
      })),
      { onConflict: "user_id,disclosure_id" }
    )
  }

  return {
    ok: true,
    bookingId: booking.id,
    clientSecret: paymentIntent.client_secret,
    pricing,
    bay,
    startsAt: startDate.toISOString(),
    endsAt: endDate.toISOString(),
  }
}
