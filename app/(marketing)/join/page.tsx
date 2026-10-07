import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/server"
import { JoinButton } from "./JoinClient"
import { BIRDIE_EAGLE_LAUNCH } from "@/lib/bookings/launch-gate"

export const metadata: Metadata = {
  title: "Membership | Tee365",
  description: "Join Tee365 and get discounts, priority booking, and more. Two tiers. Pick the one that fits your game.",
  alternates: { canonical: "https://tee365.org/join" },
}

const birdieEagleLive = new Date() >= BIRDIE_EAGLE_LAUNCH

const CHECK = (
  <svg className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

export default async function JoinPage() {
  const serviceClient = await createServiceClient()

  const { data: plans } = await serviceClient
    .from("membership_plans")
    .select("id, slug, price_monthly, joining_fee, max_members, advance_booking_days, max_active_reservations, discount_percent, first_year_discount, display_name, name, active")
    .eq("active", true)
    .order("price_monthly")

  const birdie = plans?.find(p => p.slug === "birdie")
  const eagle = plans?.find(p => p.slug === "eagle")

  return (
    <main className="mx-auto max-w-6xl px-4 py-16">

      {/* Hero */}
      <div className="text-center mb-14">
        <p className="text-xs font-semibold tracking-widest uppercase text-brand mb-3">Membership</p>
        <h1 className="text-4xl font-bold text-white mb-4">Play more. Pay less.</h1>
        <p className="text-neutral-400 max-w-xl mx-auto">
          Members get discounts on every session, priority booking windows, and more.
          No contracts. Cancel any time.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto">

        {/* Birdie */}
        {birdie && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500 mb-2">Birdie</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-white">${Number(birdie.price_monthly).toFixed(0)}</span>
                <span className="text-neutral-400 text-sm">/mo</span>
              </div>
              <p className="text-xs text-neutral-500">No joining fee · Cancel anytime</p>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {[
                "10% off all bay time",
                `${birdie.advance_booking_days}-day advance booking`,
                `Up to ${birdie.max_active_reservations} active reservations`,
                "Member communications & updates",
              ].map(b => (
                <li key={b} className="flex items-start gap-2 text-sm text-neutral-300">
                  {CHECK}
                  {b}
                </li>
              ))}
            </ul>

            {birdieEagleLive ? (
              <JoinButton
                planSlug="birdie"
                label="Join Birdie"
                className="btn-secondary w-full py-3 font-semibold"
              />
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 py-3 text-center text-sm font-semibold text-neutral-500">
                Available August 23
              </div>
            )}
          </div>
        )}

        {/* Eagle */}
        {eagle && (
          <div className="rounded-2xl border border-brand/40 bg-white/5 p-6 flex flex-col">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold tracking-widest uppercase text-neutral-500">Eagle</p>
                <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Most Popular
                </span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-white">${Number(eagle.price_monthly).toFixed(0)}</span>
                <span className="text-neutral-400 text-sm">/mo</span>
              </div>
              <p className="text-xs text-neutral-500">No joining fee · Cancel anytime</p>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {[
                "20% off all bay time",
                "2 free hours at signup (up to $100 value)",
                `${eagle.advance_booking_days}-day advance booking`,
                `Up to ${eagle.max_active_reservations} active reservations`,
                "Early league & event registration",
                "Member communications & updates",
              ].map(b => (
                <li key={b} className="flex items-start gap-2 text-sm text-neutral-300">
                  {CHECK}
                  {b}
                </li>
              ))}
            </ul>

            {birdieEagleLive ? (
              <JoinButton
                planSlug="eagle"
                label="Join Eagle"
                className="btn-primary w-full py-3 font-semibold"
              />
            ) : (
              <div className="rounded-xl border border-brand/30 bg-brand/5 py-3 text-center text-sm font-semibold text-neutral-400">
                Available August 23
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comparison table */}
      <div className="mt-16 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white mb-6 text-center">Compare plans</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-3 pr-4 text-neutral-500 font-medium w-1/2"></th>
              <th className="py-3 px-4 text-center text-white font-semibold">Birdie</th>
              <th className="py-3 px-4 text-center text-white font-semibold">Eagle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {[
              ["Monthly fee", "$10", "$39"],
              ["Joining fee", "None", "None"],
              ["Bay discount", "10%", "20%"],
              ["Advance booking", "10 days", "14 days"],
              ["Active reservations", "2", "3"],
              ["Signup bonus", "None", "2 free hours"],
              ["League priority", "None", "Early registration"],
              ["Cancel anytime", "✓", "✓"],
            ].map(([feature, b, e]) => (
              <tr key={feature}>
                <td className="py-3 pr-4 text-neutral-400">{feature}</td>
                <td className="py-3 px-4 text-center text-neutral-300">{b}</td>
                <td className="py-3 px-4 text-center text-neutral-300">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div className="mt-16 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-6 text-center">Common questions</h2>
        <div className="space-y-6">
          {[
            {
              q: "When do membership benefits start?",
              a: "Immediately after payment. Your discount applies to the next booking you make.",
            },
            {
              q: "Can I switch plans later?",
              a: "Yes, contact us and we'll handle the upgrade or downgrade. Upgrades take effect right away; downgrades take effect at the next billing cycle.",
            },
            {
              q: "Is there a contract?",
              a: "No. Both plans are month to month and you can cancel any time.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-white/10 pb-6">
              <p className="font-medium text-white mb-1.5">{q}</p>
              <p className="text-sm text-neutral-400">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
