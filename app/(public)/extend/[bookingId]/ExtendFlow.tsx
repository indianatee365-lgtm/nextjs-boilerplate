"use client"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { finalizeExtend, finalizeFreeExtend } from "./actions"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const EXTEND_OPTIONS_MINUTES = [30, 60]

interface ExtendPreview {
  pricing: {
    subtotal: number; membershipDiscount: number; veteranDiscount?: number; tax: number; total: number
    creditDiscount: number; creditHoursApplied: number; giftCardApplied: number
  }
  netCharge: number
  free: boolean
  clientSecret: string | null
  customerSessionClientSecret?: string | null
  newEndsAt: string
  extendMinutes: number
  creditHours: number
  giftCardApplied: number
  creditsNeedSignIn: boolean
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })
}
function fmtHours(h: number) {
  if (h === 0.5) return "30 min"
  return `${h} hr`
}

function Done({ newEndsAt }: { newEndsAt: string }) {
  return (
    <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
      <p className="font-semibold text-green-400">Session extended</p>
      <p className="mt-1 text-sm text-neutral-300">You&apos;re good until {fmtTime(newEndsAt)}. Enjoy your round.</p>
    </div>
  )
}

function PaymentForm({
  clientSecret, netCharge, bookingId, token, newEndsAt, onLoadError,
}: {
  clientSecret: string; netCharge: number; bookingId: string; token?: string; newEndsAt: string
  onLoadError?: () => void
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

  if (done) return <Done newEndsAt={newEndsAt} />

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement
        options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }}
        onLoadError={onLoadError}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={submitting || !stripe} className="btn-primary w-full">
        {submitting ? "Processing…" : `Pay ${fmt(netCharge)} & extend`}
      </button>
    </form>
  )
}

// Fully covered by hour credits and/or a gift card: no card form at all.
function FreeExtendButton({
  bookingId, token, preview, giftCardCode,
}: {
  bookingId: string; token?: string; preview: ExtendPreview; giftCardCode?: string
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [doneEndsAt, setDoneEndsAt] = useState<string | null>(null)

  async function handleExtend() {
    setSubmitting(true)
    setError("")
    try {
      const r = await finalizeFreeExtend({
        bookingId, token, extendMinutes: preview.extendMinutes, newEndsAt: preview.newEndsAt, giftCardCode,
      })
      setDoneEndsAt(r.newEndsAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete extension")
      setSubmitting(false)
    }
  }

  if (doneEndsAt) return <Done newEndsAt={doneEndsAt} />

  const label = preview.creditHours > 0 && preview.giftCardApplied > 0
    ? "Extend using pack hours + gift card"
    : preview.creditHours > 0 ? "Extend using pack hours" : "Extend using gift card"

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" onClick={handleExtend} disabled={submitting} className="btn-primary w-full">
        {submitting ? "Extending…" : label}
      </button>
    </div>
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
  // Same fallback as booking checkout: a payment form that fails to load with
  // saved cards on is reloaded as the plain card form.
  const [savedCardsFailed, setSavedCardsFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [giftInput, setGiftInput] = useState("")
  const [appliedGift, setAppliedGift] = useState<string | undefined>(undefined)
  const [giftError, setGiftError] = useState("")

  async function price(minutes: number, giftCardCode: string | undefined) {
    setLoading(true)
    try {
      const res = await fetch("/api/bookings/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, token, extendMinutes: minutes, giftCardCode }),
      })
      const data = await res.json()
      return { ok: res.ok, data }
    } catch {
      return { ok: false, data: { error: "Something went wrong" } }
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(minutes: number) {
    setSelectedMinutes(minutes)
    setPreview(null)
    setError("")
    setGiftError("")
    const r = await price(minutes, appliedGift)
    if (!r.ok) {
      // A gift card that stopped working should not block paying by card.
      if (appliedGift) {
        setAppliedGift(undefined)
        setGiftError(r.data.error ?? "That gift card can't be used")
        const retry = await price(minutes, undefined)
        if (retry.ok) { setPreview(retry.data); return }
        setError(retry.data.error ?? "Couldn't price that extension")
        return
      }
      setError(r.data.error ?? "Couldn't price that extension")
      return
    }
    setPreview(r.data)
  }

  async function handleApplyGift(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMinutes || !giftInput.trim()) return
    setGiftError("")
    const r = await price(selectedMinutes, giftInput.trim())
    if (!r.ok) { setGiftError(r.data.error ?? "That gift card can't be used"); return }
    setAppliedGift(giftInput.trim())
    setPreview(r.data)
  }

  async function handleRemoveGift() {
    if (!selectedMinutes) return
    setAppliedGift(undefined)
    setGiftInput("")
    setGiftError("")
    const r = await price(selectedMinutes, undefined)
    if (r.ok) setPreview(r.data)
    else setError(r.data.error ?? "Couldn't price that extension")
  }

  const signInHref = (() => {
    const back = `/extend/${bookingId}${token ? `?token=${encodeURIComponent(token)}` : ""}`
    return `/login?return=${encodeURIComponent(back)}`
  })()

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
            {preview.pricing.creditDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Pack hours ({fmtHours(preview.pricing.creditHoursApplied)})</span>
                <span>−{fmt(preview.pricing.creditDiscount)}</span>
              </div>
            )}
            {preview.pricing.membershipDiscount > 0 && (
              <div className="flex justify-between text-green-400"><span>Member discount</span><span>−{fmt(preview.pricing.membershipDiscount)}</span></div>
            )}
            {(preview.pricing.veteranDiscount ?? 0) > 0 && (
              <div className="flex justify-between text-green-400"><span>Veteran discount</span><span>−{fmt(preview.pricing.veteranDiscount ?? 0)}</span></div>
            )}
            {preview.pricing.tax > 0 && (
              <div className="flex justify-between text-neutral-400"><span>Indiana sales tax (7%)</span><span>{fmt(preview.pricing.tax)}</span></div>
            )}
            {preview.giftCardApplied > 0 && (
              <div className="flex justify-between text-green-400"><span>Gift card</span><span>−{fmt(preview.giftCardApplied)}</span></div>
            )}
            <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold text-white">
              <span>Total</span><span>{fmt(preview.netCharge)}</span>
            </div>
          </div>

          {preview.creditsNeedSignIn && (
            <p className="text-sm text-neutral-300">
              Have pack hours?{" "}
              <a href={signInHref} className="font-semibold text-brand underline underline-offset-2">Sign in</a>
              {" "}to use them.
            </p>
          )}

          {appliedGift ? (
            <p className="text-sm text-neutral-400">
              Gift card applied.{" "}
              <button type="button" onClick={handleRemoveGift} disabled={loading} className="underline hover:text-white">Remove</button>
            </p>
          ) : (
            <form onSubmit={handleApplyGift} className="flex gap-2">
              <input
                value={giftInput}
                onChange={(e) => setGiftInput(e.target.value)}
                placeholder="Gift card code"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
              />
              <button type="submit" disabled={loading || !giftInput.trim()} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:border-white/40">
                Apply
              </button>
            </form>
          )}
          {giftError && <p className="text-sm text-red-400">{giftError}</p>}

          {preview.free ? (
            <FreeExtendButton
              key={`${preview.newEndsAt}-${appliedGift ?? ""}`}
              bookingId={bookingId} token={token} preview={preview} giftCardCode={appliedGift}
            />
          ) : preview.clientSecret ? (
            <Elements
              key={`${savedCardsFailed ? "plain" : "saved"}-${preview.clientSecret}`}
              stripe={stripePromise}
              options={{
                clientSecret: preview.clientSecret,
                // Saved cards, only for the signed-in booking owner (see the extend route).
                ...(preview.customerSessionClientSecret && !savedCardsFailed
                  ? { customerSessionClientSecret: preview.customerSessionClientSecret }
                  : {}),
                appearance: { theme: "night" },
              }}
            >
              <PaymentForm
                clientSecret={preview.clientSecret}
                netCharge={preview.netCharge}
                bookingId={bookingId}
                token={token}
                newEndsAt={preview.newEndsAt}
                onLoadError={
                  preview.customerSessionClientSecret && !savedCardsFailed
                    ? () => setSavedCardsFailed(true)
                    : undefined
                }
              />
            </Elements>
          ) : null}
        </div>
      )}
    </div>
  )
}
