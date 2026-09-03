"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import Stripe from "stripe"
import { logEvent, logFailure, notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { sendGiveawayMembershipEmail } from "@/lib/resend/email"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
}

const SECONDS_PER_DAY = 24 * 60 * 60

export async function redeemMembershipGiveawayCode(
  rawCode: string
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Please log in to redeem a code." }

  const code = normalizeCode(rawCode ?? "")
  if (!code) return { ok: false, message: "Please enter a code." }

  const { data: existingMembership } = await serviceClient
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle()
  if (existingMembership) {
    return { ok: false, message: "You already have an active membership. Cancel it first if you want to switch." }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: giveaway } = await (serviceClient as any)
    .from("membership_giveaway_codes")
    .select("id, plan_id, free_period, active, expires_at, redeemed_by, membership_plans(id, slug, display_name, name, price_monthly, joining_fee, stripe_price_id, max_members)")
    .eq("code", code)
    .maybeSingle()

  if (!giveaway) return { ok: false, message: "That code is not valid." }
  if (giveaway.redeemed_by) return { ok: false, message: "This code has already been redeemed." }
  if (!giveaway.active) return { ok: false, message: "This code is no longer active." }
  if (giveaway.expires_at && new Date(giveaway.expires_at) < new Date()) {
    return { ok: false, message: "This code has expired." }
  }

  const plan = giveaway.membership_plans as {
    id: string; slug: string; display_name: string | null; name: string
    price_monthly: number; joining_fee: number | null; stripe_price_id: string | null
    max_members: number | null
  } | null
  if (!plan) return { ok: false, message: "This code's plan is no longer available." }

  if (plan.max_members) {
    const { count } = await serviceClient
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id)
      .in("status", ["active", "past_due"])
    if ((count ?? 0) >= plan.max_members) {
      return { ok: false, message: `${plan.display_name ?? plan.name} is full. Contact us to redeem this code for a different plan.` }
    }
  }

  // Atomic claim - if two requests race on the same code, only one wins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: claimed } = await (serviceClient as any)
    .from("membership_giveaway_codes")
    .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
    .eq("id", giveaway.id)
    .is("redeemed_by", null)
    .select("id")
  if (!claimed || claimed.length === 0) {
    return { ok: false, message: "This code has already been redeemed." }
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name, phone")
    .eq("id", user.id)
    .single()

  const stripe = getStripe()

  let stripeCustomerId: string
  const { data: priorMembership } = await serviceClient
    .from("memberships")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .maybeSingle()
  if (priorMembership?.stripe_customer_id) {
    stripeCustomerId = priorMembership.stripe_customer_id as string
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : undefined,
      phone: profile?.phone ?? undefined,
      metadata: { user_id: user.id },
    })
    stripeCustomerId = customer.id
  }
  await serviceClient.from("profiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id)

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
  const freeDays = giveaway.free_period === "year" ? 365 : 30
  const trialEnd = Math.floor(now.getTime() / 1000) + freeDays * SECONDS_PER_DAY
  const trialEndIso = new Date(trialEnd * 1000).toISOString()

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    plan_id: plan.id,
    plan_type: plan.slug,
    status: "active",
    stripe_customer_id: stripeCustomerId,
    started_at: now.toISOString(),
    current_period_end: trialEndIso,
    comped: false,
    // No card is collected at redemption (by design - lower friction for a
    // giveaway). Founder's joining fee is waived, not charged, but still
    // marked paid so this member correctly counts against the 100 cap the
    // same as everyone else - see check_founder_cap() trigger.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newMembership, error: memInsertErr } = await (serviceClient as any)
    .from("memberships").insert(insertData).select("id").single()
  if (memInsertErr || !newMembership) {
    const custName = await getCustomerName(serviceClient, user.id)
    await logFailure(serviceClient, "giveaway-membership-insert-FAILED",
      `user=${user.id} code=${code} plan=${plan.slug} err=${JSON.stringify(memInsertErr).slice(0, 200)}`,
      `ALERT Giveaway redemption FAILED to create membership, ${custName} code=${code} plan=${plan.slug}. Code is claimed but member has nothing. Fix manually.`)
    return { ok: false, message: "Something went wrong redeeming this code. We've been notified - please try again or contact us." }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("membership_giveaway_codes")
    .update({ membership_id: newMembership.id })
    .eq("id", giveaway.id)

  try {
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      trial_end: trialEnd,
      trial_settings: { end_behavior: { missing_payment_method: "create_invoice" } },
      metadata: { user_id: user.id, plan_id: plan.id, plan_slug: plan.slug, giveaway_code_id: giveaway.id },
    })
    await serviceClient.from("memberships")
      .update({ stripe_subscription_id: subscription.id })
      .eq("id", newMembership.id)
    await logEvent(serviceClient, "giveaway-subscription-created",
      `user=${user.id} sub=${subscription.id} code=${code} plan=${plan.slug} free_period=${giveaway.free_period}`)
  } catch (subErr) {
    const custName = await getCustomerName(serviceClient, user.id)
    await logFailure(serviceClient, "giveaway-subscription-create-FAILED",
      `user=${user.id} plan=${plan.slug} code=${code} cust=${stripeCustomerId} err=${String(subErr).slice(0, 300)}`,
      `ALERT Giveaway sub create FAILED, ${custName} plan=${plan.slug} code=${code}. Membership is active in our DB but NOT billed at rollover. Fix in Stripe manually.`)
  }

  const planName = plan.display_name ?? plan.name
  const rolloverDate = new Date(trialEndIso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })

  await Promise.allSettled([
    (async () => {
      if (!user.email) return
      const firstName = profile?.first_name ?? "there"
      await sendGiveawayMembershipEmail({
        to: user.email, firstName, planName,
        priceMonthly: Number(plan.price_monthly),
        rolloverDate,
      })
    })(),
    (async () => {
      const custName = await getCustomerName(serviceClient, user.id)
      await notifyOwner(`Giveaway code redeemed, ${planName} (${giveaway.free_period} free) ${custName}. Rolls to $${Number(plan.price_monthly).toFixed(2)}/mo on ${rolloverDate}.`)
    })(),
  ])

  revalidatePath("/account")
  return {
    ok: true,
    message: `Your free ${giveaway.free_period === "year" ? "year" : "month"} of ${planName} is active. It rolls into standard pricing ($${Number(plan.price_monthly).toFixed(2)}/mo) on ${rolloverDate} unless you cancel first.`,
  }
}
