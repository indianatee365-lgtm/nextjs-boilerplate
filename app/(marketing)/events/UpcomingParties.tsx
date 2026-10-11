import Link from "next/link"
import { createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel } from "@/lib/events"
import { ticketCounts, salesOpen, type Party } from "@/lib/tickets"

/** Upcoming ticketed parties, for the top of /events. Renders nothing when there are none. */
export default async function UpcomingParties() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data } = await db.from("ticketed_events").select("*").eq("published", true).eq("status", "on")
    .gt("ends_at", new Date().toISOString()).order("starts_at")
  const parties = (data ?? []) as Party[]
  if (!parties.length) return null
  const rows = await Promise.all(parties.map(async (p) => ({ p, left: p.capacity - (await ticketCounts(db, p.id)).sold })))

  return (
    <section className="px-6 md:px-12">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">Upcoming parties</h2>
      <div className="mt-3 space-y-3">
        {rows.map(({ p, left }) => (
          <Link key={p.id} href={`/events/${p.slug}`} className="block rounded-2xl border border-[#00A651]/40 bg-[#00A651]/10 p-5 transition hover:bg-[#00A651]/15">
            <p className="text-lg font-semibold text-white">{p.title}</p>
            <p className="mt-1 text-sm text-neutral-300">{whenLabel(p.starts_at, p.ends_at)}</p>
            <p className="mt-2 text-sm text-neutral-300">
              {money(p.ticket_price)} per ticket &middot;{" "}
              {!salesOpen(p) ? "Sales closed" : left <= 0 ? "Sold out" : left <= 15 ? `Only ${left} left` : "Tickets on sale"}
            </p>
            <span className="mt-3 inline-block text-sm font-semibold text-[#00A651]">Get tickets &rarr;</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
