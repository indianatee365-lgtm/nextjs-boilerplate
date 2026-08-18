"use client"

import { useState, useTransition } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { removePaymentMethod } from "./payment-actions"
import { CreditCard, Plus, Trash2 } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface SavedCard {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const { error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/account` },
      redirect: "if_required",
    })
    if (stripeError) {
      setError(stripeError.message ?? "Failed to save card")
      setSubmitting(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <PaymentElement options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary px-4 py-2 text-sm">
          {submitting ? "Saving…" : "Save card"}
        </button>
        <button type="button" onClick={onSuccess} className="btn-ghost px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function PaymentMethodsSection({ cards }: { cards: SavedCard[] }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)

  async function handleAddCard() {
    const res = await fetch("/api/auth/setup-intent", { method: "POST" })
    const { clientSecret } = await res.json()
    setClientSecret(clientSecret)
    setShowAddForm(true)
  }

  function handleSuccess() {
    setShowAddForm(false)
    setClientSecret(null)
    window.location.reload()
  }

  function handleRemove(paymentMethodId: string) {
    setRemoving(paymentMethodId)
    startTransition(async () => {
      await removePaymentMethod(paymentMethodId)
      setRemoving(null)
    })
  }

  const brandLabel = (brand: string) =>
    brand.charAt(0).toUpperCase() + brand.slice(1)

  return (
    <div className="mt-8" id="payment-method">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Payment method</h2>
        {!showAddForm && (
          <button onClick={handleAddCard} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
            <Plus size={14} />
            {cards.length > 0 ? "Add another" : "Add a card"}
          </button>
        )}
      </div>

      {cards.length === 0 && !showAddForm && (
        <p className="text-sm text-neutral-500">No payment method on file.</p>
      )}

      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <CreditCard size={16} className="text-neutral-400" />
              <div>
                <p className="text-sm text-white">
                  {brandLabel(card.brand)} •••• {card.last4}
                </p>
                <p className="text-xs text-neutral-500">
                  Expires {card.expMonth}/{card.expYear}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleRemove(card.id)}
              disabled={removing === card.id || isPending}
              className="text-neutral-500 hover:text-red-400 transition-colors"
              aria-label="Remove card"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {showAddForm && clientSecret && (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
          <AddCardForm onSuccess={handleSuccess} />
        </Elements>
      )}
    </div>
  )
}
