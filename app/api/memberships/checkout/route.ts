import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { planSlug } = await request.json()
    if (!["birdie", "eagle", "founder"].includes(planSlug)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    const { data: plan } = await serviceClient
      .from("membership_plans")
      .select("*")
      .eq("slug", planSlug)
      .eq("active", true)
      .single()

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    // Founder's Club: check cap and close date
    if (plan.max_members) {
      const { count } = await serviceClient
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .in("status", ["active", "past_due"])

      if ((count ?? 0) >= plan.max_members) {
        return NextResponse.json({ error: "Founder's Club is full" }, { status: 409 })
      }
    }

    if (planSlug === "founder" && new Date() > new Date("2026-08-18")) {
      return NextResponse.json({ error: "Founder's Club enrollment has closed" }, { status: 409 })
    }

    // Check for existing active membership
    const { data: existing } = await serviceClient
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: "You already have an active membership" }, { status: 409 })
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", user.id)
      .single()

    const stripe = getStripe()

    // Reuse existing Stripe customer if one exists
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

    // Auto-create Stripe price if not set, or if the saved one no longer exists in Stripe
    let stripePriceId = plan.stripe_price_id as string | null
    if (stripePriceId) {
      try {
        await stripe.prices.retrieve(stripePriceId)
      } catch {
        // Saved price doesn't exist (e.g. test-mode leftover after switching to live)
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
      await serviceClient
        .from("membership_plans")
        .update({ stripe_price_id: price.id })
        .eq("id", plan.id)
      stripePriceId = price.id
    }

    // First payment = monthly price + one-time joining fee (if any).
    // The recurring subscription is created by the webhook after this PI succeeds.
    const monthlyAmountCents = Math.round(Number(plan.price_monthly) * 100)
    const joiningFeeAmountCents = Math.round(Number(plan.joining_fee ?? 0) * 100)
    const totalAmountCents = monthlyAmountCents + joiningFeeAmountCents

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmountCents,
      currency: "usd",
      customer: stripeCustomerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "membership",
        user_id: user.id,
        plan_id: plan.id,
        plan_slug: planSlug,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: stripePriceId,
      },
      description: `Tee365 ${plan.display_name ?? plan.name} Membership`,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("[POST /api/memberships/checkout]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
