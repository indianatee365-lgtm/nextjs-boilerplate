import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendBookingPaymentFailedSms } from "@/lib/telnyx/sms"
import { sendBookingPaymentFailedEmail } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"
import Stripe from "stripe"
import { PENDING_HOLD_MINUTES } from "@/lib/bookings/pending-hold"
import { getStillConfirmedBayNames } from "@/lib/bookings/still-confirmed"

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
})

// Single source of truth, shared with every availability check.
const EXPIRY_MINUTES = PENDING_HOLD_MINUTES

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000).toISOString()

  const { data: stale } = await serviceClient
    .from("bookings")
    .select(`
      id, starts_at, ends_at, stripe_payment_intent_id, user_id,
      bays(name), profiles!user_id(first_name, phone, sms_consent)
    `)
    .eq("status", "pending")
    .lt("created_at", cutoff)

  if (!stale?.length) return NextResponse.json({ cancelled: 0 })

  type StaleBooking = {
    id: string
    starts_at: string
    ends_at: string
    stripe_payment_intent_id: string | null
    user_id: string
    bays: { name: string } | null
    profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null
  }

  const staleRows = stale as StaleBooking[]

  // Release everything first, so the notifications below describe a settled
  // state rather than racing the updates.
  await Promise.all(
    staleRows.map(async (b) => {
      if (b.stripe_payment_intent_id) {
        await getStripe().paymentIntents.cancel(b.stripe_payment_intent_id).catch(() => {})
      }
      await serviceClient
        .from("bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", b.id)
    })
  )

  // One notification per customer per start time, not per booking. Keyed on the
  // slot as well as the customer so that two releases at genuinely different
  // times still get their own accurate message.
  const groups = new Map<string, StaleBooking[]>()
  for (const b of staleRows) {
    const key = `${b.user_id}|${b.starts_at}`
    const list = groups.get(key)
    if (list) list.push(b)
    else groups.set(key, [b])
  }

  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      const first = group[0]
      if (!first.bays || !first.profiles) return

      const releasedBayNames = group
        .map((g) => g.bays?.name)
        .filter((n): n is string => Boolean(n))
      const bayLabel = releasedBayNames.join(" and ") || first.bays.name

      // Abandoned checkout: nothing was ever charged, so this is a soft nudge to
      // rebook, not a cancellation notice. Reuses the same copy the Stripe
      // payment_intent.payment_failed webhook path already sends for a declined
      // card, since "your payment didn't go through" is true either way.
      const stillConfirmedBayNames = await getStillConfirmedBayNames(
        serviceClient, first.user_id, first.starts_at, first.ends_at,
      )

      if (first.profiles.phone && first.profiles.sms_consent) {
        try {
          await sendBookingPaymentFailedSms({
            to: first.profiles.phone,
            firstName: first.profiles.first_name,
            bayName: bayLabel,
            startsAt: new Date(first.starts_at),
            stillConfirmedBayNames,
          })
        } catch (e) {
          await logFailure(serviceClient, "cancel-stale-sms-FAILED",
            `bookings=${group.map((g) => g.id).join(",")} err=${String(e).slice(0, 200)}`)
        }
      }

      const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(first.user_id)
      if (authUser?.email) {
        try {
          await sendBookingPaymentFailedEmail({
            to: authUser.email,
            firstName: first.profiles.first_name,
            bayName: bayLabel,
            startsAt: new Date(first.starts_at),
            stillConfirmedBayNames,
          })
        } catch (e) {
          await logFailure(serviceClient, "cancel-stale-email-FAILED",
            `bookings=${group.map((g) => g.id).join(",")} err=${String(e).slice(0, 200)}`)
        }
      }

      await logEvent(
        serviceClient,
        "cancel-stale-released",
        `user=${first.user_id} starts=${first.starts_at} released=${releasedBayNames.join("+")} ` +
          `still_confirmed=${stillConfirmedBayNames.join("+") || "none"} bookings=${group.map((g) => g.id).join(",")}`,
      )
    })
  )

  await logEvent(serviceClient, "cancel-stale-run", `cancelled ${stale.length} booking(s)`)
  return NextResponse.json({ cancelled: stale.length })
}
