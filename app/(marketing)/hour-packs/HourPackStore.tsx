"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ArrowLeft } from "lucide-react"
import { HOUR_PACKS, HOUR_PACK_VALID_MONTHS, REGULAR_RATE_HIGH, REGULAR_RATE_LOW, maxSavings, packPriceCents } from "@/lib/hour-packs/packs"
import { clarityPaid } from "@/lib/clarity"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const fmt = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`

type Mode = "self" | "gift"

interface Order {
  packId: string
  mode: Mode
  recipientName: string
  recipientEmail: string
  senderName: string
  credited: boolean
  /** What the server charges. Can differ from the page if the sale ended while it was open. */
  amountCents: number
}

function PaymentStep({ order, onBack, saleLive }: { order: Order; onBack: () => void; saleLive: boolean }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const pack = HOUR_PACKS.find((p) => p.id === order.packId)!
  const price = order.amountCents
  const onSale = price < pack.priceCents

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/hour-packs/success` },
        redirect: "if_required",
      })
      if (stripeError) {
        setError(stripeError.message ?? "Payment failed. Please try again.")
        setSubmitting(false)
      } else if (paymentIntent) {
        clarityPaid("hourpack_paid", paymentIntent.id)
        router.push(`/hour-packs/success?payment_intent=${paymentIntent.id}&redirect_status=succeeded`)
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-neutral-400">Pack</span><span className="text-white font-semibold">{pack.hours} hours</span></div>
        <div className="flex justify-between">
          <span className="text-neutral-400">{onSale ? "Black Friday price" : "Price"}</span>
          <span className="text-white font-semibold">
            {onSale && <span className="mr-2 font-normal text-neutral-500 line-through">{fmt(pack.priceCents)}</span>}
            {fmt(price)}
          </span>
        </div>
        {order.mode === "gift" ? (
          <>
            <div className="flex justify-between"><span className="text-neutral-400">To</span><span className="text-white">{order.recipientName}</span></div>
            <div className="flex justify-between"><span className="text-neutral-400">Code emailed to</span><span className="text-white">{order.recipientEmail}</span></div>
            <div className="flex justify-between"><span className="text-neutral-400">From</span><span className="text-white">{order.senderName}</span></div>
          </>
        ) : order.credited ? (
          <div className="flex justify-between"><span className="text-neutral-400">Goes to</span><span className="text-white">Your account, right away</span></div>
        ) : (
          <div className="flex justify-between"><span className="text-neutral-400">Code emailed to</span><span className="text-white">{order.recipientEmail}</span></div>
        )}
      </div>
      {saleLive && !onSale && (
        <p className="text-sm text-yellow-300">The Black Friday sale has ended, so this is the regular price.</p>
      )}
      <div>
        <p className="label mb-2">Payment</p>
        <PaymentElement
          options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }}
          onLoadError={() => setError("Payment form unavailable. Please refresh the page and try again.")}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={!stripe || submitting} className="btn-primary w-full py-3 text-base">
        {submitting ? "Processing..." : `Pay ${fmt(price)} for ${pack.hours} hours`}
      </button>
      <p className="text-center text-xs text-neutral-500">Payment processed securely by Stripe. Hours are good for {HOUR_PACK_VALID_MONTHS} months.</p>
    </form>
  )
}

export function HourPackStore({ signedInName, signedInEmail, saleLive }: { signedInName: string | null; signedInEmail: string | null; saleLive: boolean }) {
  const [packId, setPackId] = useState<string>(HOUR_PACKS[HOUR_PACKS.length - 1].id)
  const [mode, setMode] = useState<Mode>("gift")
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [senderName, setSenderName] = useState(signedInName ?? "")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [order, setOrder] = useState<Order | null>(null)

  const needsBuyerEmail = mode === "self" && !signedInEmail
  const valid = senderName.trim() !== "" &&
    (mode === "gift" ? recipientName.trim() !== "" && recipientEmail.trim() !== "" : !needsBuyerEmail || buyerEmail.trim() !== "")

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/hour-packs/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId, mode, senderName: senderName.trim(),
          recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(), buyerEmail: buyerEmail.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return }
      setOrder({
        packId, mode, senderName: senderName.trim(), credited: Boolean(data.credited),
        amountCents: Number(data.amountCents),
        recipientName: mode === "gift" ? recipientName.trim() : senderName.trim(),
        recipientEmail: mode === "gift" ? recipientEmail.trim() : (signedInEmail ?? buyerEmail.trim()),
      })
      setClientSecret(data.clientSecret)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (clientSecret && order) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
        <PaymentStep order={order} saleLive={saleLive} onBack={() => { setClientSecret(null); setOrder(null) }} />
      </Elements>
    )
  }

  return (
    <form onSubmit={handleContinue} className="space-y-6">
      <div>
        <p className="label mb-2">Pick a pack</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {HOUR_PACKS.map((p) => {
            const price = packPriceCents(p, saleLive)
            return (
              <button key={p.id} type="button" onClick={() => setPackId(p.id)}
                className={["rounded-xl border px-5 py-4 text-left transition",
                  packId === p.id ? "border-brand bg-brand/20" : "border-white/10 hover:border-white/30"].join(" ")}>
                <span className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-black" style={{ backgroundColor: "var(--brand)" }}>
                  Save up to ${maxSavings(p, saleLive)}
                </span>
                <span className={["block text-lg font-bold", packId === p.id ? "text-brand" : "text-white"].join(" ")}>{p.hours} hours</span>
                <span className="block text-2xl font-bold text-white mt-1">
                  {fmt(price)}
                  {saleLive && <span className="ml-2 text-base font-normal text-neutral-500 line-through">{fmt(p.priceCents)}</span>}
                </span>
                {saleLive && <span className="block text-xs font-bold uppercase tracking-wide text-brand mt-1">Black Friday price</span>}
                <span className="block text-sm font-semibold text-white mt-1">Just {fmt(Math.round(price / p.hours))} an hour</span>
                <span className="block text-xs text-neutral-400 mt-0.5">
                  Regular winter rates: <span className="line-through">${REGULAR_RATE_LOW} to ${REGULAR_RATE_HIGH} an hour</span>
                </span>
                <span className="block text-xs text-neutral-400 mt-0.5">Any day, any time</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="label mb-2">Who is it for?</p>
        <div className="flex gap-3">
          {([["gift", "A gift"], ["self", "Me"]] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={["rounded-xl border px-5 py-2.5 text-sm font-semibold transition",
                mode === m ? "border-brand bg-brand/20 text-brand" : "border-white/10 text-neutral-300 hover:border-white/30"].join(" ")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "gift" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="hpRecipientName">Recipient name</label>
            <input id="hpRecipientName" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Doe" className="input mt-1" />
            {submitted && recipientName.trim() === "" && <p className="mt-1 text-xs text-red-400">Recipient name is required</p>}
          </div>
          <div>
            <label className="label" htmlFor="hpRecipientEmail">Recipient email</label>
            <input id="hpRecipientEmail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="jane@example.com" className="input mt-1" />
            {submitted && recipientEmail.trim() === ""
              ? <p className="mt-1 text-xs text-red-400">Recipient email is required</p>
              : <p className="mt-1 text-xs text-neutral-500">We email them a code to add the hours to their account.</p>}
          </div>
        </div>
      ) : signedInEmail ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300">
          The hours go straight onto your account ({signedInEmail}) and apply automatically when you book.
        </p>
      ) : (
        <div>
          <label className="label" htmlFor="hpBuyerEmail">Your email</label>
          <input id="hpBuyerEmail" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@example.com" className="input mt-1" />
          {submitted && buyerEmail.trim() === ""
            ? <p className="mt-1 text-xs text-red-400">Your email is required</p>
            : <p className="mt-1 text-xs text-neutral-500">We email you a code to add the hours to your account. <a href="/login?return=/hour-packs" className="underline hover:text-white">Sign in</a> first and they go straight on.</p>}
        </div>
      )}

      <div>
        <label className="label" htmlFor="hpSenderName">Your name</label>
        <input id="hpSenderName" type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
          placeholder={mode === "gift" ? "How your name appears on the gift" : "Your name"} className="input mt-1" />
        {submitted && senderName.trim() === "" && <p className="mt-1 text-xs text-red-400">Your name is required</p>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
        {loading ? "Loading payment..." : "Continue to payment"}
      </button>
    </form>
  )
}
