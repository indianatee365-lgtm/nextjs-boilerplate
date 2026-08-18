"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { revalidatePath } from "next/cache"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export async function removePaymentMethod(paymentMethodId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const serviceClient = await createServiceClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  const customerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (!customerId) throw new Error("No payment method on file")

  // Verify the payment method belongs to this customer before detaching
  const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
  if (pm.customer !== customerId) throw new Error("Payment method does not belong to this account")

  await getStripe().paymentMethods.detach(paymentMethodId)
  revalidatePath("/account")
}

export async function setDefaultPaymentMethod(paymentMethodId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const serviceClient = await createServiceClient()
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  const customerId = (profile as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (!customerId) throw new Error("No payment method on file")

  // Verify the payment method belongs to this customer before making it the default
  const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
  if (pm.customer !== customerId) throw new Error("Payment method does not belong to this account")

  await getStripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })
  revalidatePath("/account")
}
