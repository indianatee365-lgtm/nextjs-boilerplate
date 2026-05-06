import type { Metadata } from "next"
import { PurchaseForm, BalanceChecker } from "./GiftCardStore"

export const metadata: Metadata = {
  title: "Gift Cards | Tee365",
  description: "Give the gift of golf. Purchase a Tee365 gift card for any amount — delivered instantly by email.",
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
