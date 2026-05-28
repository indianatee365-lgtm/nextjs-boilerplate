"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PLAN_DETAILS: Record<string, {
  name: string
  price: string
  subtext: string
  firstCharge?: string
  benefits: string[]
}> = {
  birdie: {
    name: "Birdie Membership",
    price: "$10.00/mo",
    subtext: "No joining fee · Cancel anytime",
    benefits: [
      "10% off all bay time",
      "10-day advance booking window",
      "Up to 2 active reservations",
      "Member communications & updates",
    ],
  },
  eagle: {
    name: "Eagle Membership",
    price: "$39.00/mo",
    subtext: "No joining fee · Cancel anytime",
    benefits: [
      "20% off all bay time",
      "2 free hours at signup (up to $100 value)",
      "14-day advance booking window",
      "Up to 3 active reservations",
      "Early league & event registration",
    ],
  },
  founder: {
    name: "Founder's Club",
    price: "$228.00 today",
    subtext: "Then $29.00/mo",
    firstCharge: "$199 joining fee + $29 first month",
    benefits: [
      "30% off year one, 20% off forever",
      "21-day advance booking — best available",
      "2 free hours at Founders & Friends Day",
      "Reserved league slot, guaranteed",
      "Name on the permanent Founders Wall",
      "Member number #1–100",
    ],
  },
}

const CHECK = (
  <svg className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

function MembershipPaymentForm({ planSlug }: { planSlug: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labels: Record<string, string> = {
    birdie: "Subscribe — $10.00/mo",
    eagle: "Subscribe — $39.00/mo",
    founder: "Claim your spot — $228.00 today",
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/join/checkout/return`,
        },
        redirect: "if_required",
      })
      if (stripeError) {
        setError(stripeError.message ?? "Payment failed — please try again")
        setSubmitting(false)
      } else if (paymentIntent) {
        const status = paymentIntent.status === "succeeded" ? "succeeded" : "processing"
        router.push(`/join/checkout/return?redirect_status=${status}`)
      }
    } catch {
      setError("Something went wrong — please try again")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement
        options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }}
        onLoadError={(e) => setError(`Payment form failed to load — ${e.error?.message ?? "please refresh and try again"}`)}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={submitting || !stripe || !elements}
        className="btn-primary w-full py-3 font-semibold"
      >
        {submitting ? "Processing…" : (labels[planSlug] ?? "Subscribe")}
      </button>
      <p className="text-center text-xs text-neutral-600">Payment processed securely by Stripe</p>
    </form>
  )
}

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planSlug = searchParams.get("plan") ?? "birdie"
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    if (!["birdie", "eagle", "founder"].includes(planSlug)) {
      router.replace("/join")
      return
    }
    fetch("/api/memberships/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planSlug }),
    }).then(async (res) => {
      if (res.status === 401) {
        router.push(`/login?returnUrl=/join/checkout?plan=${planSlug}`)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? "Something went wrong")
        return
      }
      setClientSecret(data.clientSecret)
    }).catch(() => {
      setApiError("Connection error — please try again")
    })
  }, [planSlug, router])

  const plan = PLAN_DETAILS[planSlug] ?? PLAN_DETAILS.birdie

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <button
          onClick={() => router.back()}
          className="mb-8 flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to plans
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">

          {/* Left — plan summary */}
          <div className="lg:sticky lg:top-10">
            <p className="text-xs font-semibold tracking-widest uppercase text-brand mb-2">Tee365 Membership</p>
            <h1 className="text-3xl font-bold text-white mb-1">{plan.name}</h1>
            <p className="text-2xl font-semibold text-brand mb-0.5">{plan.price}</p>
            <p className="text-sm text-neutral-400 mb-8">{plan.subtext}</p>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-4">What&apos;s included</p>
              <ul className="space-y-3">
                {plan.benefits.map(b => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-neutral-300">
                    {CHECK}
                    {b}
                  </li>
                ))}
              </ul>
              {plan.firstCharge && (
                <p className="mt-4 pt-4 border-t border-white/10 text-xs text-neutral-500">{plan.firstCharge}</p>
              )}
            </div>

            <p className="mt-6 text-xs text-neutral-600 text-center">Secured by Stripe · tee365.org</p>
          </div>

          {/* Right — payment form */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-5">Payment</h2>
            {apiError ? (
              <div className="space-y-4">
                <p className="text-sm text-red-400">{apiError}</p>
                <button onClick={() => router.back()} className="btn-secondary text-sm">Go back</button>
              </div>
            ) : !clientSecret ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
                <MembershipPaymentForm planSlug={planSlug} />
              </Elements>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
