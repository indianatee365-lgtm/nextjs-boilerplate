"use client"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

/**
 * Save a card to the signed-in customer's Stripe account without leaving the
 * page. Same SetupIntent flow as /account's payment methods section.
 */
function Form({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!stripe || !elements) return
    setSaving(true)
    setError(null)
    const { error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    })
    if (stripeError) {
      setError(stripeError.message ?? "Couldn't save that card")
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full py-3">
        {saving ? "Saving card..." : "Save card"}
      </button>
    </div>
  )
}

export default function AddCardInline({ onSaved }: { onSaved: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/setup-intent", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) throw new Error()
      setClientSecret(data.clientSecret)
    } catch {
      setError("Couldn't start adding a card. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (!clientSecret) {
    return (
      <div>
        <button type="button" onClick={start} disabled={loading} className="btn-secondary w-full py-3">
          {loading ? "One moment..." : "Add a card"}
        </button>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    )
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
      <Form onSaved={onSaved} />
    </Elements>
  )
}
