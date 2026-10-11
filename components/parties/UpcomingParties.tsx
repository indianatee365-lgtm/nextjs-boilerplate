import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel } from "@/lib/events"
import { ticketCounts, salesOpen, type Party } from "@/lib/tickets"

/**
 * Upcoming ticketed parties with a "Buy tickets" button each. Used on /book
 * (below the calendar), /events and /parties. With no parties it renders
 * nothing, unless emptyText is given.
 */
export default async function UpcomingParties({ heading = "Upcoming parties", emptyText, className = "" }: { heading?: string; emptyText?: string; className?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data } = await db.from("ticketed_events").select("*").eq("published", true).eq("status", "on")
    .gt("ends_at", new Date().toISOString()).order("starts_at")
  const parties = (data ?? []) as Party[]
  if (!parties.length && !emptyText) return null
  const rows = await Promise.all(parties.map(async (p) => ({ p, left: p.capacity - (await ticketCounts(db, p.id)).sold })))

  return (
    <section className={className}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">{heading}</h2>
      {!parties.length ? (
        <p className="mt-3 text-sm text-neutral-400">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map(({ p, left }) => {
            const open = salesOpen(p) && left > 0
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-2xl border border-[#00A651]/40 bg-[#00A651]/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-white">{p.title}</p>
                  <p className="mt-1 text-sm text-neutral-300">{whenLabel(p.starts_at, p.ends_at)}</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {money(p.ticket_price)} per person &middot;{" "}
                    {!salesOpen(p) ? "Sales closed" : left <= 0 ? "Sold out" : left <= 15 ? `Only ${left} left` : "Tickets on sale"}
                  </p>
                </div>
                <Link href={`/parties/${p.slug}`}
                  className={`${open ? "btn-primary" : "btn-secondary"} shrink-0 px-5 py-2.5 text-center text-sm`}>
                  {open ? "Buy tickets" : "Details"}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
