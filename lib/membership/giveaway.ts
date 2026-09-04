import Stripe from "stripe"
import { logEvent, logFailure, notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { sendGiveawayMembershipEmail } from "@/lib/resend/email"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

const SECONDS_PER_DAY = 24 * 60 * 60

export interface GiveawayPlan {
  id: string
  slug: string
  display_name: string | null
  name: string
  price_monthly: number
  joining_fee: number | null
  stripe_price_id: string | null
}

// Core of both the customer-facing code redemption (account/membership-
// giveaway-actions.ts) and the admin direct-grant-by-email action
// (admin/membership-giveaways/actions.ts) - same real Stripe subscription
// with trial_end, same rollover-to-standard-pricing behavior either way.
// Caller owns any pre-checks specific to their entry point (code validity/
// claim vs. looking up the target account) and the eventual membership_id
// backlink (a giveaway code row vs. nothing, for a direct grant).
export async function grantFreeMembership(
  serviceClient: SupabaseClient,
  params: {
    userId: string
    userEmail: string | null
    plan: GiveawayPlan
    freePeriod: "month" | "year"
    sourceLabel: string
  }
): Promise<{ ok: boolean; message: string; membershipId?: string }> {
  const { userId, userEmail, plan, freePeriod, sourceLabel } = params

  const { data: existingMembership } = await serviceClient
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
  if (existingMembership) {
    return { ok: false, message: "This account already has an active membership. Cancel it first if you want to switch." }
  }

  if (plan.slug === "founder") {
    const { count } = await serviceClient
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id)
      .in("status", ["active", "past_due"])
    const { data: planRow } = await serviceClient
      .from("membership_plans").select("max_members").eq("id", plan.id).single()
    const maxMembers = (planRow as { max_members: number | null } | null)?.max_members
    if (maxMembers && (count ?? 0) >= maxMembers) {
      return { ok: false, message: `${plan.display_name ?? plan.name} is full.` }
    }
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name, phone")
    .eq("id", userId)
    .single()

  const stripe = getStripe()

  let stripeCustomerId: string
  const { data: priorMembership } = await serviceClient
    .from("memberships")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .maybeSingle()
  if (priorMembership?.stripe_customer_id) {
    stripeCustomerId = priorMembership.stripe_customer_id as string
  } else {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : undefined,
      phone: profile?.phone ?? undefined,
      metadata: { user_id: userId },
    })
    stripeCustomerId = customer.id
  }
  await serviceClient.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", userId)

  let stripePriceId = plan.stripe_price_id
  if (stripePriceId) {
    try {
      await stripe.prices.retrieve(stripePriceId)
    } catch {
      stripePriceId = null
    }
  }
  if (!stripePriceId) {
    const displayName = plan.display_name ?? plan.name
    const product = await stripe.products.create({
      name: `${displayName} Membership`,
      metadata: { plan_id: plan.id, plan_slug: plan.slug },
    })
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number(plan.price_monthly) * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan_id: plan.id, plan_slug: plan.slug },
    })
    await serviceClient.from("membership_plans").update({ stripe_price_id: price.id }).eq("id", plan.id)
    stripePriceId = price.id
  }

  const now = new Date()
  const freeDays = freePeriod === "year" ? 365 : 30
  const trialEnd = Math.floor(now.getTime() / 1000) + freeDays * SECONDS_PER_DAY
  const trialEndIso = new Date(trialEnd * 1000).toISOString()

  const insertData: Record<string, unknown> = {
    user_id: userId,
    plan_id: plan.id,
    plan_type: plan.slug,
    status: "active",
    stripe_customer_id: stripeCustomerId,
    started_at: now.toISOString(),
    current_period_end: trialEndIso,
    comped: false,
    // No card is collected up front (by design - lower friction). Founder's
    // joining fee is waived, not charged, but still marked paid so this
    // member correctly counts against the 100 cap the same as everyone
    // else - see check_founder_cap() trigger.
    joining_fee_paid: plan.slug === "founder",
    joining_fee_paid_at: plan.slug === "founder" ? now.toISOString() : null,
  }
  if (plan.slug === "eagle") {
    insertData.signup_bonus_hours = 2
    const bonusExpiry = new Date(now)
    bonusExpiry.setDate(bonusExpiry.getDate() + 90)
    insertData.signup_bonus_expires_at = bonusExpiry.toISOString()
  }
  if (plan.slug === "founder") {
    const { data: maxRow } = await serviceClient
      .from("memberships").select("founder_number")
      .not("founder_number", "is", null)
      .order("founder_number", { ascending: false })
      .limit(1).maybeSingle()
    insertData.founder_number = ((maxRow as { founder_number: number } | null)?.founder_number ?? 0) + 1
    insertData.year_one_discount_expires_at = new Date("2027-09-01T03:59:59Z").toISOString()
    insertData.signup_bonus_hours = 2
  }

  const { data: newMembership, error: memInsertErr } = await serviceClient
    .from("memberships").insert(insertData).select("id").single()
  if (memInsertErr || !newMembership) {
    const custName = await getCustomerName(serviceClient, userId)
    await logFailure(serviceClient, "giveaway-membership-insert-FAILED",
      `user=${userId} ${sourceLabel} plan=${plan.slug} err=${JSON.stringify(memInsertErr).slice(0, 200)}`,
      `ALERT Free membership grant FAILED to create membership, ${custName} ${sourceLabel} plan=${plan.slug}. Fix manually.`)
    return { ok: false, message: "Something went wrong granting this membership. We've been notified - please try again." }
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      trial_end: trialEnd,
      trial_settings: { end_behavior: { missing_payment_method: "create_invoice" } },
      metadata: { user_id: userId, plan_id: plan.id, plan_slug: plan.slug },
    })
    await serviceClient.from("memberships")
      .update({ stripe_subscription_id: subscription.id })
      .eq("id", newMembership.id)
    await logEvent(serviceClient, "giveaway-subscription-created",
      `user=${userId} sub=${subscription.id} ${sourceLabel} plan=${plan.slug} free_period=${freePeriod}`)
  } catch (subErr) {
    const custName = await getCustomerName(serviceClient, userId)
    await logFailure(serviceClient, "giveaway-subscription-create-FAILED",
      `user=${userId} plan=${plan.slug} ${sourceLabel} cust=${stripeCustomerId} err=${String(subErr).slice(0, 300)}`,
      `ALERT Free membership sub create FAILED, ${custName} plan=${plan.slug} ${sourceLabel}. Membership is active in our DB but NOT billed at rollover. Fix in Stripe manually.`)
  }

  const planName = plan.display_name ?? plan.name
  const rolloverDate = new Date(trialEndIso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })

  await Promise.allSettled([
    (async () => {
      if (!userEmail) return
      const firstName = profile?.first_name ?? "there"
      await sendGiveawayMembershipEmail({
        to: userEmail, firstName, planName,
        priceMonthly: Number(plan.price_monthly),
        rolloverDate,
      })
    })(),
    (async () => {
      const custName = await getCustomerName(serviceClient, userId)
      await notifyOwner(`Free membership granted, ${planName} (${freePeriod} free) ${custName} [${sourceLabel}]. Rolls to $${Number(plan.price_monthly).toFixed(2)}/mo on ${rolloverDate}.`)
    })(),
  ])

  return {
    ok: true,
    membershipId: newMembership.id,
    message: `${freePeriod === "year" ? "A free year" : "A free month"} of ${planName} is now active. It rolls into standard pricing ($${Number(plan.price_monthly).toFixed(2)}/mo) on ${rolloverDate} unless cancelled first.`,
  }
}
