import Stripe from "stripe"
import { logEvent, logFailure, notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { sendMembershipReinstatedEmail } from "@/lib/resend/email"
import { sendMembershipReinstatedSms } from "@/lib/telnyx/sms"
import { PLAN_DISPLAY_NAMES } from "@/lib/membership/first-year"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

/**
 * A former member may rejoin once per year (Jerrod, 2026-09-13). Keeping the
 * window as a named constant rather than a bare 365 so the rule is greppable
 * when someone asks "how often can they come back?"
 */
export const REJOIN_COOLDOWN_DAYS = 365

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface ReinstateResult {
  ok: boolean
  message: string
  membershipId?: string
  subscriptionStatus?: string
  /** Set when the only thing standing in the way is a missing card, so the
   *  caller can point the member at the add-a-card form instead of a dead end. */
  needsCard?: boolean
}

/**
 * Put a lapsed member back exactly where they were.
 *
 * The existing self-service reactivateMembership() in account/membership-actions.ts
 * only covers the "cancellation scheduled but the period hasn't ended yet" case:
 * it requires status='active' with cancellation_requested_at set and just flips
 * cancel_at_period_end off. Once Stripe actually deletes the subscription the
 * member is status='cancelled' with no subscription, and nothing could bring
 * them back. Going through /join instead would have treated them as a stranger:
 * charged the $199 founder joining fee a second time, issued a brand new founder
 * number, and left the old row orphaned.
 *
 * So this updates the member's EXISTING row in place. founder_number,
 * joining_fee_paid, year_one_discount_expires_at and started_at are all
 * deliberately left untouched - that is the whole point of "as if nothing
 * happened," and it means a founder keeps both their original number and the
 * shared 9/1/27 bonus-discount expiry rather than getting a fresh year of it.
 *
 * Safe against the founder cap: enforce_founder_cap is BEFORE INSERT only, and
 * check_founder_cap() counts founders by joining_fee_paid regardless of status,
 * so a cancelled founder's slot was never released and reusing the row cannot
 * consume a second one.
 *
 * Runs from two entry points. The member restores their own membership from
 * /account, which is what the cancel dialog has always promised them ("you can
 * reactivate any time at your original Founder's terms"), and no joining fee is
 * being forgiven to do it - joining_fee_paid is already true on the row they
 * are restoring. An admin can also do it from /admin/users/[id].
 *
 * The difference between the two is profiles.reinstate_blocked, which only the
 * self-serve path honours: someone removed under the zero-tolerance policy must
 * not be able to click their way back in, while an admin reinstating by hand IS
 * the override. Messages are also worded for whoever is reading them.
 */
export async function reinstateMembership(
  serviceClient: SupabaseClient,
  params: { userId: string; overrideCooldown?: boolean; actorLabel: string; selfServe?: boolean }
): Promise<ReinstateResult> {
  const { userId, overrideCooldown = false, actorLabel, selfServe = false } = params

  if (selfServe) {
    const { data: gate } = await serviceClient
      .from("profiles").select("reinstate_blocked, banned").eq("id", userId).maybeSingle()
    const g = gate as { reinstate_blocked: boolean; banned: boolean } | null
    // Two separate flags on purpose. A chargeback should stop someone
    // rejoining without barring them from the building; a ban does both.
    if (g?.reinstate_blocked || g?.banned) {
      await logEvent(serviceClient, "membership-reinstate-blocked",
        `user=${userId} self-serve restore refused, ${g?.banned ? "banned" : "reinstate_blocked"} is set`)
      return {
        ok: false,
        message: "We can't restore this membership online. Please email info@tee365.org and we'll take a look.",
      }
    }
  }

  const { data: activeAlready } = await serviceClient
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .maybeSingle()
  if (activeAlready) {
    return { ok: false, message: "This account already has an active membership. Nothing to reinstate." }
  }

  const { data: lapsedRow } = await serviceClient
    .from("memberships")
    .select("id, plan_id, plan_type, status, stripe_customer_id, stripe_subscription_id, started_at, cancelled_at, founder_number, joining_fee_paid, year_one_discount_expires_at, reactivation_count, last_reinstated_at, membership_plans(name, display_name, price_monthly, stripe_price_id)")
    .eq("user_id", userId)
    .eq("status", "cancelled")
    .order("cancelled_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (!lapsedRow) {
    return { ok: false, message: "No cancelled membership found for this account." }
  }

  const m = lapsedRow as {
    id: string
    plan_id: string
    plan_type: string
    stripe_customer_id: string | null
    started_at: string
    cancelled_at: string | null
    founder_number: number | null
    joining_fee_paid: boolean | null
    year_one_discount_expires_at: string | null
    reactivation_count: number | null
    last_reinstated_at: string | null
    membership_plans: {
      name: string
      display_name: string | null
      price_monthly: number
      stripe_price_id: string | null
    } | null
  }

  const plan = m.membership_plans
  if (!plan) {
    return { ok: false, message: "That membership's plan record is missing. Fix the plan link before reinstating." }
  }

  const planName = plan.display_name ?? plan.name ?? PLAN_DISPLAY_NAMES[m.plan_type] ?? m.plan_type

  // Once a year. Checked against last_reinstated_at rather than
  // reactivation_count, because a count alone cannot tell you when.
  if (m.last_reinstated_at && !overrideCooldown) {
    const daysSince = (Date.now() - new Date(m.last_reinstated_at).getTime()) / MS_PER_DAY
    if (daysSince < REJOIN_COOLDOWN_DAYS) {
      const eligibleOn = new Date(new Date(m.last_reinstated_at).getTime() + REJOIN_COOLDOWN_DAYS * MS_PER_DAY)
        .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
      return {
        ok: false,
        message: selfServe
          ? `Memberships can be restored once a year. Yours was last restored ${Math.floor(daysSince)} days ago, so you're eligible again on ${eligibleOn}. Email info@tee365.org if you need it sooner.`
          : `Already reinstated within the last year (${Math.floor(daysSince)} days ago). Eligible again on ${eligibleOn}. Override if you want to do it anyway.`,
      }
    }
  }

  const stripe = getStripe()

  let stripeCustomerId = m.stripe_customer_id
  if (!stripeCustomerId) {
    const { data: profileRow } = await serviceClient
      .from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle()
    stripeCustomerId = (profileRow as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null
  }
  if (!stripeCustomerId) {
    return { ok: false, message: "No Stripe customer on file for this account, so there is nothing to bill. They need to sign up fresh." }
  }

  // A reinstate that silently creates an unpayable subscription is worse than
  // refusing: the member would think they are back in and only find out at the
  // first failed renewal. Check for a usable card before touching anything.
  let defaultPaymentMethod: string | null = null
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId)
    if (!customer.deleted) {
      const invoiceDefault = customer.invoice_settings?.default_payment_method
      defaultPaymentMethod = typeof invoiceDefault === "string" ? invoiceDefault : invoiceDefault?.id ?? null
      if (!defaultPaymentMethod) {
        const cards = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card", limit: 1 })
        defaultPaymentMethod = cards.data[0]?.id ?? null
      }
    }
  } catch (err) {
    return { ok: false, message: `Could not read their Stripe customer: ${String(err).slice(0, 150)}` }
  }
  if (!defaultPaymentMethod) {
    return {
      ok: false,
      needsCard: true,
      message: selfServe
        ? "Add a card to your account first, then restore your membership."
        : "No card on file at Stripe. Have them add one at tee365.org/account, then reinstate.",
    }
  }

  // Same price-resolution dance as checkout and giveaway: a saved price can be
  // a test-mode leftover that no longer resolves in live mode.
  let stripePriceId = plan.stripe_price_id
  if (stripePriceId) {
    try {
      await stripe.prices.retrieve(stripePriceId)
    } catch {
      stripePriceId = null
    }
  }
  if (!stripePriceId) {
    const product = await stripe.products.create({
      name: `${planName} Membership`,
      metadata: { plan_id: m.plan_id, plan_slug: m.plan_type },
    })
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number(plan.price_monthly) * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan_id: m.plan_id, plan_slug: m.plan_type },
    })
    await serviceClient.from("membership_plans").update({ stripe_price_id: price.id }).eq("id", m.plan_id)
    stripePriceId = price.id
  }

  // No joining fee on the subscription: they already paid it the first time,
  // and joining_fee_paid on the row still says so.
  let subscription: Stripe.Subscription
  try {
    subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      default_payment_method: defaultPaymentMethod,
      metadata: {
        user_id: userId,
        plan_id: m.plan_id,
        plan_slug: m.plan_type,
        reinstated: "true",
        reinstated_membership_id: m.id,
      },
    })
  } catch (err) {
    const custName = await getCustomerName(serviceClient, userId)
    await logFailure(serviceClient, "membership-reinstate-subscription-FAILED",
      `user=${userId} membership=${m.id} plan=${m.plan_type} cust=${stripeCustomerId} err=${String(err).slice(0, 300)}`,
      `ALERT Reinstate FAILED at Stripe, ${custName} ${planName}. Nothing changed on our side. Check Stripe.`)
    return { ok: false, message: `Stripe refused to create the subscription: ${String(err).slice(0, 200)}` }
  }

  // current_period_end moved onto the subscription item in recent Stripe API
  // versions but is still present at the top level on older ones, so read both.
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
    ?? (subscription.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end

  // Only the fields that describe "is this membership live right now" change.
  // founder_number, joining_fee_paid, year_one_discount_expires_at and
  // started_at are conspicuously absent on purpose.
  const { error: updateErr } = await serviceClient
    .from("memberships")
    .update({
      status: "active",
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      cancelled_at: null,
      cancellation_requested_at: null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      reactivation_count: (m.reactivation_count ?? 0) + 1,
      last_reinstated_at: new Date().toISOString(),
    })
    .eq("id", m.id)

  if (updateErr) {
    const custName = await getCustomerName(serviceClient, userId)
    await logFailure(serviceClient, "membership-reinstate-db-FAILED",
      `user=${userId} membership=${m.id} sub=${subscription.id} err=${JSON.stringify(updateErr).slice(0, 200)}`,
      `ALERT Reinstate half-finished, ${custName} ${planName}. Stripe sub ${subscription.id} EXISTS but our row is still cancelled. Fix manually now.`)
    return { ok: false, message: "Stripe subscription was created but our record did not update. You have been alerted - fix this manually." }
  }

  await logEvent(serviceClient, "membership-reinstated",
    `user=${userId} membership=${m.id} plan=${m.plan_type} founder#=${m.founder_number ?? "n/a"} sub=${subscription.id} sub_status=${subscription.status} by=${actorLabel}`)

  const priceStr = Number(plan.price_monthly).toFixed(2)
  const nextCharge = periodEnd
    ? new Date(periodEnd * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
    : "your next billing date"

  const { data: prof } = await serviceClient
    .from("profiles").select("first_name, phone, sms_consent").eq("id", userId).maybeSingle()
  const p = prof as { first_name: string; phone: string | null; sms_consent: boolean } | null
  const firstName = p?.first_name ?? "there"

  await Promise.allSettled([
    (async () => {
      const { data: authRes } = await serviceClient.auth.admin.getUserById(userId)
      const email = authRes?.user?.email
      if (!email) return
      await sendMembershipReinstatedEmail({
        to: email,
        firstName,
        planName,
        priceMonthly: priceStr,
        nextCharge,
        isFounder: m.plan_type === "founder",
        founderNumber: m.founder_number,
      })
    })(),
    (async () => {
      if (!p?.phone || !p.sms_consent) return
      await sendMembershipReinstatedSms({ to: p.phone, firstName, planName, priceMonthly: priceStr })
    })(),
    (async () => {
      const custName = await getCustomerName(serviceClient, userId)
      const founderTag = m.founder_number ? ` (Founder #${m.founder_number} kept)` : ""
      await notifyOwner(`Membership REINSTATED, ${planName} ${custName}${founderTag}. $${priceStr}/mo, no joining fee. Sub ${subscription.status}, next charge ${nextCharge}.`)
    })(),
  ])

  const founderNote = m.founder_number ? ` Founder #${m.founder_number} preserved.` : ""
  const discountNote = m.year_one_discount_expires_at
    ? ` Year-one discount still expires ${new Date(m.year_one_discount_expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}.`
    : ""

  return {
    ok: true,
    membershipId: m.id,
    subscriptionStatus: subscription.status,
    message: `${planName} reinstated at $${priceStr}/mo, joining fee waived.${founderNote}${discountNote} Stripe subscription is ${subscription.status}; next charge ${nextCharge}.`,
  }
}
