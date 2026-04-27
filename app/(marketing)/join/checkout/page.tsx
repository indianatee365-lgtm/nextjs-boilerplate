"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const PLAN_DETAILS: Record<string, {
  name: string
  price: string
  subtext: string
  benefits: string[]
}> = {
  birdie: {
    name: "Birdie Membership",
    price: "$10/mo",
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
    price: "$39/mo",
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
    price: "$199 + $29/mo",
    subtext: "One-time joining fee, then $29/mo",
    benefits: [
      "30% off year one, 20% off forever",
      "Price floor of $20/hr — always saving",
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

export default function CheckoutPage() {
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [planSlug, setPlanSlug] = useState<string>("birdie")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cs = sessionStorage.getItem("membership_cs")
    const plan = sessionStorage.getItem("membership_plan")
    if (!cs) {
      router.replace("/join")
      return
    }
    setClientSecret(cs)
    setPlanSlug(plan ?? "birdie")
    // Clear so a refresh forces re-entry
    sessionStorage.removeItem("membership_cs")
    sessionStorage.removeItem("membership_plan")
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push("/join")} className="btn-secondary">Back to plans</button>
        </div>
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const plan = PLAN_DETAILS[planSlug] ?? PLAN_DETAILS.birdie

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <button onClick={() => router.push("/join")} className="mb-8 flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to plans
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">

          {/* Left — what you're buying */}
          <div className="lg:sticky lg:top-10">
            <p className="text-xs font-semibold tracking-widest uppercase text-brand mb-2">Tee365 Membership</p>
            <h1 className="text-3xl font-bold text-white mb-1">{plan.name}</h1>
            <p className="text-2xl font-semibold text-brand mb-1">{plan.price}</p>
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
            </div>

            <p className="mt-6 text-xs text-neutral-600 text-center">
              Secured by Stripe · tee365.org
            </p>
          </div>

          {/* Right — embedded Stripe checkout */}
          <div id="checkout">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        </div>
      </div>
    </div>
  )
}
