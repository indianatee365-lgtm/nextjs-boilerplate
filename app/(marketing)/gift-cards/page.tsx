import type { Metadata } from "next"
import { PurchaseForm, BalanceChecker } from "./GiftCardStore"
import { createServiceClient } from "@/lib/supabase/server"
import { getDiscount, effectivePercent } from "@/lib/admin/discounts"
import { isBonusLive, BONUS_PER_HUNDRED, BONUS_RULES_TEXT } from "@/lib/promos/holiday-bonus-rules"
import Link from "next/link"

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
  const bonusLive = isBonusLive()

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
        {bonusLive && (
          <div className="mt-5 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
            <p className="font-bold text-white">Black Friday weekend: get a ${BONUS_PER_HUNDRED} bonus card for every $100</p>
            <p className="mt-1 text-neutral-300">Buy a $100 card, they get $120. Bonus cards are emailed with the gift. {BONUS_RULES_TEXT} Ends Monday, Nov 30.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 mb-10">
        <h2 className="text-lg font-semibold text-white mb-6">Purchase a gift card</h2>
        <PurchaseForm discountPercent={discountPercent} bonusLive={bonusLive} />
      </div>

      <Link href="/hour-packs" className="mb-10 block rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 transition hover:border-white/30">
        <p className="text-sm font-semibold tracking-widest uppercase text-brand mb-1">New: Hour packs</p>
        <p className="text-lg font-semibold text-white">Give hours instead: 5 hours for $150, 10 hours for $280</p>
        <p className="mt-1 text-sm text-neutral-400">Good any day, any time, for 6 months. For you or as a gift.</p>
      </Link>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
        <h2 className="text-lg font-semibold text-white mb-2">Check your balance</h2>
        <p className="text-sm text-neutral-400 mb-5">Enter your gift card code to see the remaining balance.</p>
        <BalanceChecker />
      </div>
    </main>
  )
}
