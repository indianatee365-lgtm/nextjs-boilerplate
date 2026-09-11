import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getAllDiscounts, isLive, type PromoDiscount, type DiscountKind } from "@/lib/admin/discounts"
import { saveDiscount } from "./actions"

export const metadata = { title: "Discounts | Tee365 Admin" }
export const dynamic = "force-dynamic"

const CARDS: { kind: DiscountKind; title: string; blurb: string }[] = [
  {
    kind: "booking_hours",
    title: "Bay time",
    blurb:
      "Percent off bay bookings. Comes off before the membership discount, so the two stack: a 20% sale for an Eagle member works out to 36% off, not 40%.",
  },
  {
    kind: "gift_card",
    title: "Gift cards",
    blurb:
      "Percent off the purchase price. Face value is unchanged, so a discounted $100 card still loads $100 of balance for the recipient.",
  },
]

function StatusPill({ d }: { d: PromoDiscount }) {
  if (isLive(d)) {
    return (
      <span className="rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-semibold text-green-400">
        {Number(d.percentOff)}% off, live now
      </span>
    )
  }
  return (
    <span className="rounded-full bg-neutral-500/20 px-2.5 py-1 text-xs font-semibold text-neutral-400">
      No sale running
    </span>
  )
}

export default async function AdminDiscountsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const discounts = await getAllDiscounts(serviceClient)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold text-white">Discounts</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Site-wide sales. These apply automatically at checkout and are what the website advertises,
          so turning one off here stops the discount and removes the promotion from the site together.
        </p>
      </div>

      <div className="space-y-5">
        {CARDS.map(card => {
          const d = discounts[card.kind]
          const live = isLive(d)
          return (
            <section key={card.kind} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                <StatusPill d={d} />
              </div>
              <p className="mt-2 text-sm text-neutral-400">{card.blurb}</p>

              <div className="mt-5 flex flex-wrap items-end gap-3">
                <form action={saveDiscount} className="flex items-end gap-3">
                  <input type="hidden" name="kind" value={card.kind} />
                  <input type="hidden" name="intent" value="on" />
                  <label className="block">
                    <span className="block text-xs text-neutral-500 mb-1">Percent off</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="percent_off"
                        min="1"
                        max="100"
                        step="1"
                        defaultValue={d.percentOff > 0 ? String(Number(d.percentOff)) : ""}
                        placeholder="20"
                        className="w-28 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                      />
                      <span className="text-sm text-neutral-500">%</span>
                    </div>
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-black hover:brightness-95"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    {live ? "Update sale" : "Start sale"}
                  </button>
                </form>

                {live && (
                  <form action={saveDiscount}>
                    <input type="hidden" name="kind" value={card.kind} />
                    <input type="hidden" name="intent" value="off" />
                    <button
                      type="submit"
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-white/5"
                    >
                      End sale
                    </button>
                  </form>
                )}
              </div>

              {d.updatedAt && (
                <p className="mt-3 text-xs text-neutral-600">
                  Last changed {new Date(d.updatedAt).toLocaleString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                    hour: "numeric", minute: "2-digit",
                    timeZone: "America/Indiana/Indianapolis",
                  })}
                </p>
              )}
            </section>
          )
        })}
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Bay time sales apply to new bookings only. An existing booking keeps the price it was made at,
        and rescheduling or extending re-prices at the slot rate without the sale.
      </p>
    </main>
  )
}
