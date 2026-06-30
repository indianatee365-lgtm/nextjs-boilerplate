import type { Metadata } from "next"
import { PurchaseForm, BalanceChecker } from "./GiftCardStore"

export const metadata: Metadata = {
  title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
  description: "Give the gift of indoor golf in South Bend. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking. 20% off through opening day.",
  alternates: {
    canonical: "https://tee365.org/gift-cards",
  },
  openGraph: {
    type: "website",
    title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
    description: "Give the gift of indoor golf in South Bend. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking. 20% off through opening day.",
    url: "https://tee365.org/gift-cards",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
    description: "Give the gift of indoor golf in South Bend. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking. 20% off through opening day.",
    images: ["https://tee365.org/hero.jpg"],
  },
}

export default function GiftCardsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold tracking-widest uppercase text-brand mb-2">Gift Cards</p>
        <h1 className="text-3xl font-bold text-white mb-3">Give the Gift of Golf</h1>
        <p className="text-neutral-400 text-base max-w-md mx-auto">
          The perfect gift for any golfer. Delivered instantly by email, redeemable on any Tee365 bay booking.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 mb-10">
        <h2 className="text-lg font-semibold text-white mb-6">Purchase a gift card</h2>
        <PurchaseForm />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
        <h2 className="text-lg font-semibold text-white mb-2">Check your balance</h2>
        <p className="text-sm text-neutral-400 mb-5">Enter your gift card code to see the remaining balance.</p>
        <BalanceChecker />
      </div>
    </main>
  )
}
