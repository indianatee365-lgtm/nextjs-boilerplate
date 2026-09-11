import type { Metadata } from "next"
import { PurchaseForm, BalanceChecker } from "./GiftCardStore"
import { createServiceClient } from "@/lib/supabase/server"
import { getDiscount, effectivePercent } from "@/lib/admin/discounts"

export const metadata: Metadata = {
  title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
  description: "Give the gift of indoor golf in Mishawaka. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking.",
  alternates: {
    canonical: "https://tee365.org/gift-cards",
  },
  openGraph: {
    type: "website",
    title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
    description: "Give the gift of indoor golf in Mishawaka. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking.",
    url: "https://tee365.org/gift-cards",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Golf Gift Cards | Tee365 Indoor Golf Simulator South Bend",
    description: "Give the gift of indoor golf in Mishawaka. Tee365 gift cards are delivered instantly by email and redeemable on any bay booking.",
    images: ["https://tee365.org/hero.jpg"],
  },
}

export default async function GiftCardsPage() {
  // Read from the same row the charge uses (see /admin/discounts), so the
  // page can never advertise a sale that checkout isn't giving. The previous
  // hardcoded "20% off through opening day" copy outlived the discount by
  // 11 days.
  const serviceClient = await createServiceClient()
  const discountPercent = effectivePercent(await getDiscount(serviceClient, "gift_card"))

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold tracking-widest uppercase text-brand mb-2">Gift Cards</p>
        <h1 className="text-3xl font-bold text-white mb-3">Give the Gift of Golf</h1>
        <p className="text-neutral-400 text-base max-w-md mx-auto">
          The perfect gift for any golfer. Delivered instantly by email, redeemable on any Tee365 bay booking.
        </p>
        {discountPercent > 0 && (
          <p
            className="mt-4 inline-flex items-center rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-black"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {discountPercent}% off gift cards right now
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 mb-10">
        <h2 className="text-lg font-semibold text-white mb-6">Purchase a gift card</h2>
        <PurchaseForm discountPercent={discountPercent} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
        <h2 className="text-lg font-semibold text-white mb-2">Check your balance</h2>
        <p className="text-sm text-neutral-400 mb-5">Enter your gift card code to see the remaining balance.</p>
        <BalanceChecker />
      </div>
    </main>
  )
}
