import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel } from "@/lib/events"
import { ticketCounts, salesOpen, type Party } from "@/lib/tickets"
import BuyTickets from "./BuyTickets"

export const dynamic = "force-dynamic"

async function load(slug: string): Promise<Party | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data } = await db.from("ticketed_events").select("*").eq("slug", slug).maybeSingle()
  const p = data as Party | null
  return p && (p.published || p.status === "cancelled") ? p : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug)
  if (!p) return { title: "Party | Tee365" }
  return {
    title: `${p.title} | Tee365`,
    description: `${whenLabel(p.starts_at, p.ends_at)} at Tee365, Mishawaka. ${money(p.ticket_price)} per ticket.`,
    openGraph: { title: p.title, description: `${whenLabel(p.starts_at, p.ends_at)} at Tee365. Get your tickets.`, images: [{ url: "https://tee365.org/hero.jpg" }] },
  }
}

export default async function PartyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ bought?: string }> }) {
  const p = await load((await params).slug)
  if (!p) notFound()
  const { bought } = await searchParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { sold, held } = await ticketCounts(db, p.id)
  const left = Math.max(0, p.capacity - sold)
  const buyable = Math.max(0, p.capacity - sold - held)
  const open = salesOpen(p)

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/events" className="text-sm text-neutral-400 hover:text-white">&larr; Events</Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#00A651]">Tee365 party</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">{p.title}</h1>
      <p className="mt-2 text-sm text-neutral-300">{whenLabel(p.starts_at, p.ends_at)} &middot; 4615 Grape Rd, Mishawaka</p>
      {p.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-neutral-300">{p.description}</p>}

      {p.activities.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {p.activities.map((a) => (
            <div key={a.bay} className="flex gap-3 border-t border-white/10 px-4 py-3 text-sm first:border-t-0">
              <span className="w-16 shrink-0 font-semibold text-white">{a.bay}</span>
              <span className="text-neutral-300">{a.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/10 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold text-white">{money(p.ticket_price)} <span className="text-sm font-normal text-neutral-400">per ticket</span></p>
          <p className="text-sm text-neutral-400">{p.status === "cancelled" ? "Cancelled" : left <= 0 ? "Sold out" : `${left} of ${p.capacity} left`}</p>
        </div>
        {bought && <p className="mt-4 text-sm text-[#00A651]">You&apos;re in! Your tickets are on their way to your email. The door code comes about 3 hours before the start.</p>}
        {p.status === "cancelled" ? (
          <p className="mt-4 text-sm text-neutral-300">This party was cancelled and every ticket refunded.</p>
        ) : !open ? (
          <p className="mt-4 text-sm text-neutral-300">Ticket sales have closed.</p>
        ) : buyable <= 0 ? (
          <p className="mt-4 text-sm text-neutral-300">{left > 0 ? "The last tickets are in someone's checkout right now. Check back in 30 minutes." : "Sold out, sorry! Watch this page for the next one."}</p>
        ) : (
          <div className="mt-4"><BuyTickets slug={p.slug} price={Number(p.ticket_price)} max={Math.min(p.max_per_order, buyable)} /></div>
        )}
      </div>
      <p className="mt-6 text-xs text-neutral-500">Tickets are for entry to the party. Tee365 is alcohol-free. Questions or refunds: (574) 444-9365.</p>
    </main>
  )
}
