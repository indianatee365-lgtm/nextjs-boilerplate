import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const serviceClient = await createServiceClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  let customerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null

  if (!customerId) {
    const { data: authUser } = await serviceClient.auth.admin.getUserById(user.id)
    const customer = await getStripe().customers.create({
      email: authUser.user?.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await serviceClient.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id)
  }

  const setupIntent = await getStripe().setupIntents.create({
    customer: customerId,
    usage: "off_session",
  })

  return NextResponse.json({ clientSecret: setupIntent.client_secret })
}
