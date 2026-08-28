import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendBookingPaymentFailedSms } from "@/lib/telnyx/sms"
import { sendBookingPaymentFailedEmail } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"
import Stripe from "stripe"

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
})

const EXPIRY_MINUTES = 15

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
      id, starts_at, stripe_payment_intent_id, user_id,
      bays(name), profiles!user_id(first_name, phone, sms_consent)
    `)
    .eq("status", "pending")
    .lt("created_at", cutoff)

  if (!stale?.length) return NextResponse.json({ cancelled: 0 })

  type StaleBooking = {
    id: string
    starts_at: string
    stripe_payment_intent_id: string | null
    user_id: string
    bays: { name: string } | null
    profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null
  }

  await Promise.all(
    (stale as StaleBooking[]).map(async (b) => {
      if (b.stripe_payment_intent_id) {
        await getStripe().paymentIntents.cancel(b.stripe_payment_intent_id).catch(() => {})
      }
      await serviceClient
        .from("bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", b.id)

      // Abandoned checkout: nothing was ever charged, so this is a soft nudge to
      // rebook, not a cancellation notice. Reuses the same copy the Stripe
      // payment_intent.payment_failed webhook path already sends for a declined
      // card, since "your payment didn't go through" is true either way.
      if (b.bays && b.profiles) {
        if (b.profiles.phone && b.profiles.sms_consent) {
          try {
            await sendBookingPaymentFailedSms({
              to: b.profiles.phone,
              firstName: b.profiles.first_name,
              bayName: b.bays.name,
              startsAt: new Date(b.starts_at),
            })
          } catch (e) {
            await logFailure(serviceClient, "cancel-stale-sms-FAILED",
              `booking=${b.id} err=${String(e).slice(0, 200)}`)
          }
        }

        const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(b.user_id)
        if (authUser?.email) {
          try {
            await sendBookingPaymentFailedEmail({
              to: authUser.email,
              firstName: b.profiles.first_name,
              bayName: b.bays.name,
              startsAt: new Date(b.starts_at),
            })
          } catch (e) {
            await logFailure(serviceClient, "cancel-stale-email-FAILED",
              `booking=${b.id} err=${String(e).slice(0, 200)}`)
          }
        }
      }
    })
  )

  await logEvent(serviceClient, "cancel-stale-run", `cancelled ${stale.length} booking(s)`)
  return NextResponse.json({ cancelled: stale.length })
}
