import { redirect } from "next/navigation"
import Link from "next/link"
import Stripe from "stripe"
import { findPack } from "@/lib/hour-packs/packs"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// The Stripe webhook creates the hours and sends the email (lib/hour-packs/
// fulfill.ts). This page only confirms the payment, so a slow webhook can
// never leave the customer with a code that was created here but never sent.
export default async function HourPackSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>
}) {
  const { payment_intent, redirect_status } = await searchParams
  if (!payment_intent || redirect_status !== "succeeded") redirect("/hour-packs")

  let pi: Stripe.PaymentIntent
  try {
    pi = await getStripe().paymentIntents.retrieve(payment_intent)
  } catch {
    redirect("/hour-packs")
  }
  if (pi.status !== "succeeded" || pi.metadata?.type !== "hour_pack") redirect("/hour-packs")

  const pack = findPack(pi.metadata.packId)
  const hours = pack?.hours ?? 0
  const { mode, userId, recipientName, recipientEmail } = pi.metadata

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-8 py-10 mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          {mode === "gift" ? `${hours} hours on the way to ${recipientName}` : `${hours} hours, all yours`}
        </h1>
        <p className="text-neutral-300">
          {mode === "gift"
            ? <>We emailed {recipientName} a code at <strong className="text-white">{recipientEmail}</strong>. They add it under Free hours on their Tee365 account.</>
            : userId
              ? <>The hours are on your account and apply automatically when you book. A receipt is on its way to <strong className="text-white">{recipientEmail}</strong>.</>
              : <>We emailed your code to <strong className="text-white">{recipientEmail}</strong>. Sign in, open Account, and enter it under Free hours.</>}
        </p>
        <p className="mt-4 text-xs text-neutral-500">The email can take a minute. Check spam if you don&apos;t see it.</p>
      </div>
      <div className="flex gap-3 justify-center">
        <Link href="/hour-packs" className="btn-secondary px-5 py-2.5">Buy another</Link>
        <Link href="/book" className="btn-primary px-5 py-2.5">Book a bay</Link>
      </div>
    </main>
  )
}
