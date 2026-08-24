import { Instagram, Facebook, Music2, MapPin } from "lucide-react"
import { createServiceClient } from "@/lib/supabase/server"
import WaitlistForm from "@/app/components/sections/WaitlistForm"

export default async function Info() {
  const serviceClient = await createServiceClient()
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
          Tee365 is building a 24/7 indoor golf space designed for quick sessions,
          late-night practice, competition with your buddies, or in a league. Full
          details, pricing, and address will be posted as soon as possible.
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
            <h3 className="text-lg font-semibold text-white">Get Early Access</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Be first to hear about launch updates, founding memberships, and early
              booking access.
            </p>

            <WaitlistForm />

            <div className="mt-5 border-t border-white/10 pt-4">
              <h3 className="mt-4 text-lg font-semibold text-white">
                Follow For Launch Updates
              </h3>

              <div className="mt-3 flex items-center gap-4">
                <a
                  href="https://www.instagram.com/tee365.mishawaka"
                  target="_blank"
                  rel="nofollow noreferrer noopener"
                  aria-label="Tee365 on Instagram"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Instagram size={16} />
                </a>

                <a
                  href="https://www.facebook.com/people/Tee365/61578292102933/"
                  target="_blank"
                  rel="nofollow noreferrer noopener"
                  aria-label="Tee365 on Facebook"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Facebook size={16} />
                </a>

                <a
                  href="https://www.tiktok.com/@tee36568?_t=ZT-8ybYXacTg5X&_r=1"
                  target="_blank"
                  rel="nofollow noreferrer noopener"
                  aria-label="Tee365 on TikTok"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Music2 size={16} />
                </a>

                <a
                  href="https://share.google/d8bNieAsQUqaYomQZ"
                  target="_blank"
                  rel="nofollow noreferrer noopener"
                  aria-label="Tee365 on Google Maps"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <MapPin size={16} />
                </a>
              </div>
            </div>

            <p className="mt-2 text-xs text-neutral-400"></p>
          </div>
        </div>

        <div
          className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold text-white">Gift Cards</h3>
          <p className="mt-2 text-sm text-neutral-300">
            Give the gift of golf. Buy now at 20% off through opening day, the recipient gets the full value.
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
