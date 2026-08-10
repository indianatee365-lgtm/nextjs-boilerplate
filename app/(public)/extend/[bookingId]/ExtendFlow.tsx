"use client"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { finalizeExtend } from "./actions"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const EXTEND_OPTIONS_MINUTES = [30, 60]

interface ExtendPreview {
  pricing: { subtotal: number; membershipDiscount: number; tax: number; total: number }
  netCharge: number
  clientSecret: string
  newEndsAt: string
  extendMinutes: number
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })
}

function PaymentForm({
  clientSecret, netCharge, bookingId, token, newEndsAt,
}: {
  clientSecret: string; netCharge: number; bookingId: string; token?: string; newEndsAt: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const paymentIntentId = clientSecret.split("_secret_")[0]

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError("")

    const returnUrl = new URL(`${window.location.origin}/extend/${bookingId}/return`)
    if (token) returnUrl.searchParams.set("token", token)
    returnUrl.searchParams.set("newEndsAt", newEndsAt)

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl.toString() },
      redirect: "if_required",
    })

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed")
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status === "succeeded") {
      try {
        await finalizeExtend({ bookingId, token, newEndsAt, paymentIntentId })
        setDone(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete extension")
        setSubmitting(false)
      }
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
        <p className="font-semibold text-green-400">Session extended</p>
        <p className="mt-1 text-sm text-neutral-300">You&apos;re good until {fmtTime(newEndsAt)}. Enjoy your round.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={submitting || !stripe} className="btn-primary w-full">
        {submitting ? "Processing…" : `Pay ${fmt(netCharge)} & extend`}
      </button>
    </form>
  )
}

export default function ExtendFlow({
  bookingId, token, currentEndsAt,
}: {
  bookingId: string
  token?: string
  currentEndsAt: string
}) {
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null)
  const [preview, setPreview] = useState<ExtendPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSelect(minutes: number) {
    setSelectedMinutes(minutes)
    setPreview(null)
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/bookings/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token, extendMinutes: minutes }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Couldn't price that extension"); return }
      setPreview(data)
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <p className="text-sm text-neutral-400">How much more time?</p>
        <div className="grid grid-cols-2 gap-3">
          {EXTEND_OPTIONS_MINUTES.map((minutes) => (
            <button
              key={minutes}
              onClick={() => handleSelect(minutes)}
              disabled={loading}
              className={[
                "rounded-lg border py-3 text-sm font-medium transition",
                selectedMinutes === minutes
                  ? "border-brand bg-brand/20 text-brand"
                  : "border-white/10 text-white hover:border-white/30",
              ].join(" ")}
            >
              +{minutes} min
            </button>
          ))}
        </div>
        {loading && <p className="text-sm text-neutral-400">Calculating pricing…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {preview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          <p className="text-sm text-neutral-400">
            New end time: <span className="text-white font-medium">{fmtTime(preview.newEndsAt)}</span>
            {" "}(was {fmtTime(currentEndsAt)})
          </p>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-neutral-400"><span>Subtotal</span><span>{fmt(preview.pricing.subtotal)}</span></div>
            {preview.pricing.membershipDiscount > 0 && (
              <div className="flex justify-between text-green-400"><span>Member discount</span><span>−{fmt(preview.pricing.membershipDiscount)}</span></div>
            )}
            {preview.pricing.tax > 0 && (
              <div className="flex justify-between text-neutral-400"><span>Indiana sales tax (7%)</span><span>{fmt(preview.pricing.tax)}</span></div>
            )}
            <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold text-white">
              <span>Total</span><span>{fmt(preview.netCharge)}</span>
            </div>
          </div>

          <Elements stripe={stripePromise} options={{ clientSecret: preview.clientSecret, appearance: { theme: "night" } }}>
            <PaymentForm
              clientSecret={preview.clientSecret}
              netCharge={preview.netCharge}
              bookingId={bookingId}
              token={token}
              newEndsAt={preview.newEndsAt}
            />
          </Elements>
        </div>
      )}
    </div>
  )
}
