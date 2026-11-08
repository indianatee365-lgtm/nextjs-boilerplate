import type Stripe from "stripe"
import { logEvent, logFailure, getCustomerName } from "@/lib/observability/notify"
import { sendEagleHoursUnlockedSms } from "@/lib/telnyx/sms"
import { sendFounderMessage } from "@/lib/resend/email"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Eagle's 2 free hours, decided 2026-11-08.
 *
 * They used to be granted at signup. Members joined for $39, spent up to $100
 * of free bay time and cancelled within a day or two (two did exactly that on
 * 11/6 and 11/7). Now the hours land when the member's 3rd monthly payment
 * goes through, by which point they've paid $117, more than 2 hours can be
 * worth.
 *
 * Rules (match /join, /join/checkout, /faq and /terms section 3a):
 * - granted once per person, ever (unique index on hour_credits enforces it),
 * - good for 60 days from the day they land,
 * - not for free or comped memberships,
 * - not for anyone who already got the old Eagle signup bonus.
 */
export const EAGLE_HOURS = 2
export const EAGLE_HOURS_PAYMENT = 3
export const EAGLE_HOURS_DAYS = 60
export const EAGLE_HOURS_REASON = "Eagle 3rd-month hours"
const OLD_SIGNUP_REASON = "Eagle signup bonus"

/** When the 3rd monthly payment is due: signup is payment 1, so two months on. */
export function eagleHoursUnlockDate(startedAt: string | Date): Date {
  const d = new Date(startedAt)
  d.setMonth(d.getMonth() + (EAGLE_HOURS_PAYMENT - 1))
  return d
}

/**
 * Call on every paid subscription invoice. Grants the hours once the member
 * has made 3 payments: the signup charge (a PaymentIntent, not an invoice,
 * see the payment_intent.succeeded branch of the Stripe webhook) plus the
 * paid renewal invoices on their subscription. $0 trial invoices don't count.
 */
export async function maybeGrantEagleHours(
  client: SupabaseClient,
  stripe: Stripe,
  params: { subscriptionId: string; now: Date }
): Promise<void> {
  const { subscriptionId, now } = params

  const { data: m } = await client
    .from("memberships")
    .select("user_id, plan_type, status, granted_free, comped, signup_amount_paid")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle()
  if (!m?.user_id || m.plan_type !== "eagle" || m.granted_free || m.comped) return

  const { data: prior } = await client
    .from("hour_credits")
    .select("id")
    .eq("user_id", m.user_id)
    .in("reason", [EAGLE_HOURS_REASON, OLD_SIGNUP_REASON])
    .limit(1)
  if (prior && prior.length > 0) return

  const invoices = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 })
  const paidRenewals = invoices.data.filter((i) => (i.amount_paid ?? 0) > 0).length
  const payments = paidRenewals + (Number(m.signup_amount_paid ?? 0) > 0 ? 1 : 0)
  if (payments < EAGLE_HOURS_PAYMENT) return

  const expires = new Date(now)
  expires.setDate(expires.getDate() + EAGLE_HOURS_DAYS)

  const { error } = await client.from("hour_credits").insert({
    user_id: m.user_id,
    hours: EAGLE_HOURS,
    hours_remaining: EAGLE_HOURS,
    reason: EAGLE_HOURS_REASON,
    expires_at: expires.toISOString(),
    active: true,
    created_by: m.user_id,
    redeemed_at: now.toISOString(),
  })
  if (error) {
    // Unique index: a duplicate Stripe event already granted them.
    if (error.code === "23505") return
    const custName = await getCustomerName(client, m.user_id)
    await logFailure(client, "eagle-hours-credit-FAILED",
      `user=${m.user_id} sub=${subscriptionId} err=${JSON.stringify(error).slice(0, 200)}`,
      `ALERT Eagle 3rd-month free hours NOT granted, ${custName}. They paid their 3rd month. Add 2 hours by hand.`)
    return
  }
  await logEvent(client, "eagle-hours-granted", `user=${m.user_id} sub=${subscriptionId} payments=${payments}`)

  const expiresLabel = expires.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Indiana/Indianapolis" })
  const [{ data: profile }, { data: { user: authUser } }] = await Promise.all([
    client.from("profiles").select("first_name, phone, sms_consent").eq("id", m.user_id).single(),
    client.auth.admin.getUserById(m.user_id),
  ])
  const p = profile as { first_name: string; phone: string | null; sms_consent: boolean } | null
  const firstName = p?.first_name ?? "there"

  await Promise.allSettled([
    authUser?.email
      ? sendFounderMessage({
          to: authUser.email,
          firstName,
          subject: "Your 2 free Eagle hours are here",
          heading: "2 free hours, on us",
          paragraphs: [
            "Thanks for sticking with Eagle. Your 3rd month just renewed, so 2 free hours of bay time are now in your account.",
            `Book at tee365.org/book and they come off automatically, no code needed. Use them by ${expiresLabel}.`,
          ],
          ctaText: "Book your free hours",
          ctaUrl: "https://tee365.org/book",
          kind: "eagle-hours-unlocked",
        }).catch((err) => logFailure(client, "eagle-hours-email-FAILED", `user=${m.user_id} err=${String(err).slice(0, 200)}`))
      : Promise.resolve(),
    p?.phone && p.sms_consent
      ? sendEagleHoursUnlockedSms({ to: p.phone, firstName, expiresLabel })
          .catch((err) => logFailure(client, "eagle-hours-sms-FAILED", `user=${m.user_id} err=${String(err).slice(0, 200)}`))
      : Promise.resolve(),
  ])
}
