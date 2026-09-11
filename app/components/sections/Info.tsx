import { createServiceClient } from "@/lib/supabase/server"
import { getDiscount, effectivePercent } from "@/lib/admin/discounts"
import WaitlistForm from "@/app/components/sections/WaitlistForm"

export default async function Info() {
  const serviceClient = await createServiceClient()
  // Same row the gift card checkout charges off (see /admin/discounts).
  // This block used to hardcode "20% off through opening day", which kept
  // advertising a sale for 11 days after it ended.
  const giftCardPercent = effectivePercent(await getDiscount(serviceClient, "gift_card"))
  const { data: plans } = await serviceClient
    .from("membership_plans")
    .select("slug, price_monthly, discount_percent, advance_booking_days, max_active_reservations")
    .in("slug", ["birdie", "eagle"])
    .eq("active", true)

  const birdie = plans?.find((p) => p.slug === "birdie")
  const eagle = plans?.find((p) => p.slug === "eagle")

  return (
    <section
      id="info"
      className="relative overflow-hidden rounded-3xl border border-[color:var(--brandLine)] bg-white/5 p-8"
    >
<div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-40"
        style={{ backgroundColor: "var(--brandGlow)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-44 right-[-120px] h-[520px] w-[520px] rounded-full blur-3xl opacity-35"
        style={{ backgroundColor: "var(--brandSoft)" }}
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300"></p>

        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Indoor golf. 24/7. No hassle.
        </h2>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
          Tee365 is a 24/7 indoor golf space designed for quick sessions,
          late-night practice, competition with your buddies, or league play.
          We&apos;re at 4615 Grape Rd in Mishawaka, open every hour of every day.
        </p>

        <div className="mx-auto mt-8 grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          <div className="w-full rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Birdie &amp; Eagle Memberships</h3>
            <p className="mt-2 text-sm text-neutral-300">
              On sale now. Discounted bay time, priority booking windows, no contract.
            </p>

            {(birdie || eagle) && (
              <table className="mt-4 w-full text-sm text-neutral-200">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                    <th className="py-1.5 font-semibold"></th>
                    <th className="py-1.5 font-semibold text-white">Birdie</th>
                    <th className="py-1.5 font-semibold text-white">Eagle</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-white/10">
                    <td className="py-1.5 text-neutral-400">Price</td>
                    <td className="py-1.5">{birdie ? `$${Number(birdie.price_monthly).toFixed(0)}/mo` : "-"}</td>
                    <td className="py-1.5">{eagle ? `$${Number(eagle.price_monthly).toFixed(0)}/mo` : "-"}</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="py-1.5 text-neutral-400">Bay discount</td>
                    <td className="py-1.5">{birdie ? `${birdie.discount_percent}%` : "-"}</td>
                    <td className="py-1.5">{eagle ? `${eagle.discount_percent}%` : "-"}</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="py-1.5 text-neutral-400">Advance booking</td>
                    <td className="py-1.5">{birdie ? `${birdie.advance_booking_days} days` : "-"}</td>
                    <td className="py-1.5">{eagle ? `${eagle.advance_booking_days} days` : "-"}</td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <td className="py-1.5 text-neutral-400">Active reservations</td>
                    <td className="py-1.5">{birdie ? birdie.max_active_reservations : "-"}</td>
                    <td className="py-1.5">{eagle ? eagle.max_active_reservations : "-"}</td>
                  </tr>
                </tbody>
              </table>
            )}

            <a
              href="/join"
              className="mt-5 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-95"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Become a Member →
            </a>
          </div>

          <div
            className="w-full rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
          >
            <h3 className="text-lg font-semibold text-white">Stay in the loop</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Occasional email about leagues, events, and member deals. No spam,
              unsubscribe any time.
            </p>

            <WaitlistForm />

            <p className="mt-2 text-xs text-neutral-400"></p>
          </div>
        </div>

        <div
          className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold text-white">Gift Cards</h3>
          <p className="mt-2 text-sm text-neutral-300">
            Give the gift of golf. Delivered instantly by email, redeemable on any
            bay booking, and they never expire.
            {giftCardPercent > 0 && (
              <> Right now they&apos;re {giftCardPercent}% off, and the recipient still gets the full value.</>
            )}
          </p>

          <a
            href="/gift-cards"
            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Buy a Gift Card →
          </a>
        </div>
      </div>
    </section>
  )
}
