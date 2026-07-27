"use client"

import { useState, useEffect } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ChevronDown, ChevronUp } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface Disclosure { id: string; title: string; body: string }
interface PendingData {
  bookingId: string
  bayName: string
  startsAt: string
  endsAt: string
  total: number
  clientSecret: string | null
  expiresAt: string
  disclosures: Disclosure[]
  acknowledgedIds: string[]
}
type LoadState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "confirmed" }
  | { status: "pending"; data: PendingData }

function formatWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const dateStr = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Indiana/Indianapolis" })
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" }
  return `${dateStr}, ${start.toLocaleTimeString("en-US", opts)} – ${end.toLocaleTimeString("en-US", opts)}`
}

function PaymentForm({ returnUrl, total, onError }: { returnUrl: string; total: number; onError: (msg: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!stripe || !elements) return
    setSubmitting(true)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) { onError(submitError.message ?? "Payment failed"); return }
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
      })
      if (error) onError(error.message ?? "Payment failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mt-5">
        <PaymentElement options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }} />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting || !stripe || !elements}
        className="btn-primary mt-5 w-full"
      >
        {submitting ? "Processing…" : `Pay $${total.toFixed(2)} and confirm`}
      </button>
      <p className="mt-2 text-center text-xs text-neutral-500">
        Payment processed securely by Stripe
      </p>
    </>
  )
}

export default function CompleteBookingFlow({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingAck, setSavingAck] = useState(false)
  const [readyForPayment, setReadyForPayment] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/complete`)
      .then((r) => r.json())
      .then((json) => {
        if (json.state === "pending") {
          setState({ status: "pending", data: json })
          setAcknowledged(new Set(json.acknowledgedIds ?? []))
          if ((json.disclosures ?? []).length === 0) setReadyForPayment(true)
        } else if (json.state === "confirmed") {
          setState({ status: "confirmed" })
        } else if (json.state === "expired") {
          setState({ status: "expired" })
        } else {
          setState({ status: "not_found" })
        }
      })
      .catch(() => setState({ status: "not_found" }))
  }, [bookingId])

  if (state.status === "loading") {
    return <p className="mt-8 text-sm text-neutral-400">Loading your reservation…</p>
  }

  if (state.status === "not_found") {
    return (
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-white">We couldn&apos;t find that reservation.</p>
        <p className="mt-1 text-sm text-neutral-400">Call us at 574-999-0622 and we&apos;ll get it sorted out.</p>
      </div>
    )
  }

  if (state.status === "expired") {
    return (
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-white">This reservation link has expired.</p>
        <p className="mt-1 text-sm text-neutral-400">
          Held reservations are released after 15 minutes. Call us at 574-999-0622 and we&apos;ll book another one for you.
        </p>
      </div>
    )
  }

  if (state.status === "confirmed") {
    return (
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-white">You&apos;re all set — this booking is already confirmed.</p>
        <p className="mt-1 text-sm text-neutral-400">
          We&apos;ll text your access code shortly before your session starts.
        </p>
      </div>
    )
  }

  const { data } = state
  const allAcknowledged = data.disclosures.length === 0 || data.disclosures.every((d) => acknowledged.has(d.id))

  async function handleContinueToPayment() {
    setSavingAck(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disclosureIds: Array.from(acknowledged) }),
      })
      if (!res.ok) { setError("Something went wrong saving that. Please try again."); return }
      setReadyForPayment(true)
    } finally {
      setSavingAck(false)
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-neutral-400">Bay</p>
      <p className="text-lg font-semibold text-white">{data.bayName}</p>
      <p className="mt-3 text-sm text-neutral-400">When</p>
      <p className="text-white">{formatWindow(data.startsAt, data.endsAt)}</p>
      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="font-semibold text-white">Total due</span>
        <span className="text-xl font-bold text-white">${data.total.toFixed(2)}</span>
      </div>

      {!readyForPayment && data.disclosures.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-white">
            Please read and acknowledge the following before booking:
          </p>
          {data.disclosures.map((d) => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              >
                <span className="text-sm font-medium text-white">{d.title}</span>
                {expanded === d.id
                  ? <ChevronUp size={16} className="text-neutral-400 shrink-0" />
                  : <ChevronDown size={16} className="text-neutral-400 shrink-0" />}
              </button>
              {expanded === d.id && (
                <div className="border-t border-white/10 px-4 py-3">
                  <div className="max-h-48 overflow-y-auto text-xs leading-5 text-neutral-300 whitespace-pre-wrap">
                    {d.body}
                  </div>
                </div>
              )}
              <div className="border-t border-white/10 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={acknowledged.has(d.id)}
                    onChange={() => setAcknowledged((prev) => {
                      const next = new Set(prev)
                      next.has(d.id) ? next.delete(d.id) : next.add(d.id)
                      return next
                    })}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 accent-brand"
                  />
                  I have read and agree to the {d.title}
                </label>
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleContinueToPayment}
            disabled={savingAck || !allAcknowledged}
            className="btn-primary mt-2 w-full"
          >
            {savingAck ? "Saving…" : allAcknowledged ? "Continue to payment" : `Acknowledge all ${data.disclosures.length} items to continue`}
          </button>
        </div>
      )}

      {readyForPayment && data.clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: data.clientSecret,
            appearance: { theme: "night" },
          }}
        >
          <PaymentForm
            returnUrl={`${window.location.origin}/book/complete/${bookingId}`}
            total={data.total}
            onError={setError}
          />
        </Elements>
      )}
      {error && readyForPayment && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  )
}
