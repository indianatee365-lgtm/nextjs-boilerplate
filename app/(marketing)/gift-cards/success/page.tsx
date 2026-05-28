import { redirect } from "next/navigation"
import Link from "next/link"
import Stripe from "stripe"
import { createServiceClient } from "@/lib/supabase/server"
import { randomBytes } from "crypto"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

function generateCode(): string {
  return randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
}

export default async function GiftCardSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>
}) {
  const { payment_intent, redirect_status } = await searchParams
  if (!payment_intent || redirect_status !== "succeeded") redirect("/gift-cards")

  let pi: Stripe.PaymentIntent
  try {
    pi = await getStripe().paymentIntents.retrieve(payment_intent)
  } catch {
    redirect("/gift-cards")
  }

  if (pi.status !== "succeeded" || pi.metadata?.type !== "gift_card") redirect("/gift-cards")

  const { recipientName, recipientEmail, senderName, amountCents } = pi.metadata!
  const amount = parseInt(amountCents) / 100
  const stripePaymentId = pi.id

  const supabase = await createServiceClient()

  const { data: existing } = await supabase
    .from("gift_cards")
    .select("code, balance")
    .eq("stripe_payment_id", stripePaymentId)
    .single()

  let code: string
  let balance: number

  if (existing) {
    code = existing.code
    balance = Number(existing.balance)
  } else {
    code = generateCode()
    await supabase.from("gift_cards").insert({
      code,
      original_amount: amount,
      balance: amount,
      active: true,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      purchased_by: senderName,
      stripe_payment_id: stripePaymentId,
    })

    balance = amount
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-8 py-10 mb-6">
        <p className="text-4xl mb-4">🎁</p>
        <h1 className="text-2xl font-bold text-white mb-2">Gift card sent!</h1>
        <p className="text-neutral-400 mb-8">
          A ${amount.toFixed(2)} gift card has been emailed to <strong className="text-white">{recipientEmail}</strong>.
        </p>
        <div className="bg-black/30 rounded-xl px-6 py-5 mb-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">Gift card code</p>
          <p className="text-2xl font-bold tracking-[6px] text-white font-mono">{code}</p>
          <p className="text-xs text-neutral-500 mt-2">Balance: ${balance.toFixed(2)}</p>
        </div>
        <p className="text-xs text-neutral-500">Save this code for your records. It can be entered at checkout on any Tee365 booking.</p>
      </div>
      <div className="flex gap-3 justify-center">
        <Link href="/gift-cards" className="btn-secondary px-5 py-2.5">Buy another</Link>
        <Link href="/book" className="btn-primary px-5 py-2.5">Book a bay</Link>
      </div>
    </main>
  )
}
