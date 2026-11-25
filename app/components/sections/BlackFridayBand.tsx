import Link from "next/link"
import { isBonusLive, BONUS_PER_HUNDRED, BONUS_RULES_TEXT } from "@/lib/promos/holiday-bonus-rules"
import { HOUR_PACKS, REGULAR_RATE_HIGH, REGULAR_RATE_LOW, maxSavings } from "@/lib/hour-packs/packs"

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`

// Home page Black Friday section (2026-11-20). Renders only during the sale
// window in lib/promos/holiday-bonus-rules.ts, so it disappears on its own
// after Cyber Monday.
export default function BlackFridayBand() {
  if (!isBonusLive()) return null
  return (
    <section className="rounded-2xl border border-brand/50 bg-brand/10 p-6 md:p-10">
      <p className="text-sm font-extrabold tracking-[0.2em] uppercase text-brand">Black Friday Sale</p>
      <h2 className="mt-2 text-3xl md:text-4xl font-bold text-white">Golf for as little as $28 an hour</h2>
      <p className="mt-2 text-neutral-300">Now through Cyber Monday, November 30. Regular winter rates are ${REGULAR_RATE_LOW} to ${REGULAR_RATE_HIGH} an hour.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[...HOUR_PACKS].reverse().map((p) => (
          <Link key={p.id} href="/hour-packs" className="rounded-xl border border-white/10 bg-black/30 p-5 transition hover:border-brand">
            <p className="text-sm font-semibold text-neutral-400">{p.hours}-hour pack</p>
            <p className="mt-1 text-3xl font-bold text-white">
              {money(p.salePriceCents)} <span className="text-base font-normal text-neutral-500 line-through">{money(p.priceCents)}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-300">{money(Math.round(p.salePriceCents / p.hours))} an hour, save up to ${maxSavings(p, true)}</p>
          </Link>
        ))}
        <Link href="/gift-cards" className="rounded-xl border border-white/10 bg-black/30 p-5 transition hover:border-brand">
          <p className="text-sm font-semibold text-neutral-400">Gift cards</p>
          <p className="mt-1 text-3xl font-bold text-white">+${BONUS_PER_HUNDRED} bonus</p>
          <p className="mt-1 text-sm text-neutral-300">With every $100. Keep the bonus or give it. {BONUS_RULES_TEXT}</p>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/hour-packs" className="btn-primary px-5 py-2.5">Get an hour pack</Link>
        <Link href="/gift-cards" className="btn-secondary px-5 py-2.5">Shop gift cards</Link>
      </div>
    </section>
  )
}
