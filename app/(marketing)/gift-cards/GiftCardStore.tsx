"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ArrowLeft } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const PRESETS = [25, 50, 100]
function fmt(n: number) { return `$${n.toFixed(2)}` }

interface GiftCardDetails {
  amountCents: number
  recipientName: string
  recipientEmail: string
  senderName: string
}

function PaymentStep({ details, onBack }: { details: GiftCardDetails; onBack: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/gift-cards/success` },
        redirect: "if_required",
      })
      if (stripeError) {
        setError(stripeError.message ?? "Payment failed. Please try again.")
        setSubmitting(false)
      } else if (paymentIntent) {
        router.push(`/gift-cards/success?payment_intent=${paymentIntent.id}&redirect_status=succeeded`)
      }
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  const amount = details.amountCents / 100
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back
      </button>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-neutral-400">Amount</span><span className="text-white font-semibold">{fmt(amount)}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">To</span><span className="text-white">{details.recipientName}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">Delivered to</span><span className="text-white">{details.recipientEmail}</span></div>
        <div className="flex justify-between"><span className="text-neutral-400">From</span><span className="text-white">{details.senderName}</span></div>
      </div>
      <div>
        <p className="label mb-2">Payment</p>
        <PaymentElement
          options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }}
          onLoadError={() => setError("Payment form unavailable. Please refresh the page and try again.")}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={!stripe || submitting} className="btn-primary w-full py-3 text-base">
        {submitting ? "Processing..." : `Purchase ${fmt(amount)} gift card`}
      </button>
      <p className="text-center text-xs text-neutral-500">Payment processed securely by Stripe. Gift cards never expire.</p>
    </form>
  )
}

export function PurchaseForm() {
  const [step, setStep] = useState<"form" | "payment">("form")
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [details, setDetails] = useState<GiftCardDetails | null>(null)
  const [amount, setAmount] = useState<number | null>(50)
  const [custom, setCustom] = useState("")
  const [useCustom, setUseCustom] = useState(false)
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [senderName, setSenderName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const effectiveAmount = useCustom ? parseFloat(custom) : (amount ?? 0)
  const valid = effectiveAmount >= 10 && effectiveAmount <= 500
    && recipientName.trim().length > 0 && recipientEmail.trim().length > 0 && senderName.trim().length > 0

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid) return
    setLoading(true)
    setError("")
    try {
      const amountCents = Math.round(effectiveAmount * 100)
      const res = await fetch("/api/gift-cards/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(), senderName: senderName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return }
      setDetails({ amountCents, recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(), senderName: senderName.trim() })
      setClientSecret(data.clientSecret)
      setStep("payment")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (step === "payment" && clientSecret && details) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
        <PaymentStep details={details} onBack={() => setStep("form")} />
      </Elements>
    )
  }

  return (
    <form onSubmit={handleContinue} className="space-y-6">
      <div>
        <p className="label mb-2">Gift card amount</p>
        <div className="flex flex-wrap gap-3">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => { setAmount(p); setUseCustom(false) }}
              className={["rounded-xl border px-6 py-3 text-lg font-semibold transition",
                !useCustom && amount === p ? "border-brand bg-brand/20 text-brand" : "border-white/10 text-neutral-300 hover:border-white/30"
              ].join(" ")}>
              ${p}
            </button>
          ))}
          <button type="button" onClick={() => setUseCustom(true)}
            className={["rounded-xl border px-6 py-3 text-lg font-semibold transition",
              useCustom ? "border-brand bg-brand/20 text-brand" : "border-white/10 text-neutral-300 hover:border-white/30"
            ].join(" ")}>
            Custom
          </button>
        </div>
        {useCustom && (
          <div className="mt-3">
            <div className="flex items-center gap-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:border-white/30 transition">
              <span className="text-neutral-400 font-semibold text-sm mr-1 shrink-0">$</span>
              <input type="number" min={10} max={500} step={1} value={custom}
                onChange={(e) => setCustom(e.target.value)} placeholder="Enter amount (10–500)"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder-neutral-600 min-w-0"
                style={{ WebkitAppearance: "none" }}
                autoFocus />
            </div>
            {custom && (parseFloat(custom) < 10 || parseFloat(custom) > 500) && (
              <p className="mt-1 text-xs text-red-400">Amount must be between $10 and $500</p>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="recipientName">Recipient name</label>
          <input id="recipientName" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Jane Doe" className="input mt-1" />
          {submitted && recipientName.trim() === "" && (
            <p className="mt-1 text-xs text-red-400">Recipient name is required</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="recipientEmail">Recipient email</label>
          <input id="recipientEmail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="jane@example.com" className="input mt-1" />
          {submitted && recipientEmail.trim() === "" ? (
            <p className="mt-1 text-xs text-red-400">Recipient email is required</p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">The gift card code is emailed here.</p>
          )}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="senderName">Your name</label>
        <input id="senderName" type="text" value={senderName} onChange={(e) => setSenderName(e.target.value)}
          placeholder="How your name appears on the gift" className="input mt-1" />
        {submitted && senderName.trim() === "" && (
          <p className="mt-1 text-xs text-red-400">Your name is required</p>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
        {loading ? "Loading payment..." : "Continue to payment"}
      </button>
    </form>
  )
}

export function BalanceChecker() {
  const [code, setCode] = useState("")
  const [result, setResult] = useState<{ balance: number; originalAmount: number; active: boolean; expiresAt: string | null } | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch(`/api/gift-cards/balance?code=${encodeURIComponent(code.trim())}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Not found"); return }
      setResult(data)
    } catch { setError("Something went wrong. Please try again.") }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleCheck} className="space-y-4">
      <div className="flex gap-3">
        <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX" className="input flex-1 font-mono tracking-widest" />
        <button type="submit" disabled={!code.trim() || loading} className="btn-secondary px-5 shrink-0">
          {loading ? "..." : "Check"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className={`rounded-xl border px-4 py-4 ${result.active ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
          {result.active ? (
            <>
              <p className="font-semibold text-green-400">Active gift card</p>
              <p className="mt-1 text-2xl font-bold text-white">${result.balance.toFixed(2)} remaining</p>
              <p className="mt-0.5 text-xs text-neutral-400">Original value: ${result.originalAmount.toFixed(2)}
                {result.balance < result.originalAmount && ` - $${(result.originalAmount - result.balance).toFixed(2)} used`}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-red-400">Gift card depleted or inactive</p>
              <p className="mt-0.5 text-sm text-neutral-400">This card has a $0 balance or has been deactivated.</p>
            </>
          )}
        </div>
      )}
    </form>
  )
}
