import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel, type EventRow } from "@/lib/events"
import NewEventForm from "./NewEventForm"

export const dynamic = "force-dynamic"

const STATUS: Record<string, string> = {
  awaiting_payment: "Awaiting payment", deposit_paid: "Deposit paid", paid: "Paid in full", cancelled: "Cancelled",
}

/** Upcoming (not over, not cancelled) first by date; everything else newest first. */
function splitEvents(all: EventRow[]): { upcoming: EventRow[]; past: EventRow[] } {
  const now = Date.now()
  const upcoming = all.filter((e) => new Date(e.ends_at).getTime() >= now && e.status !== "cancelled")
  return { upcoming, past: all.filter((e) => !upcoming.includes(e)).reverse() }
}

export default async function AdminEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: events } = await db.from("events").select("*").order("starts_at", { ascending: true })
  const { upcoming, past } = splitEvents((events ?? []) as EventRow[])
  const { data: bays } = await db.from("bays").select("id, name, number").eq("active", true).order("number")

  const row = (e: EventRow) => (
    <Link key={e.id} href={`/admin/events/${e.id}`} className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 hover:bg-white/5">
      <div>
        <p className="font-medium text-white">{e.title}</p>
        <p className="text-xs text-neutral-400">{whenLabel(e.starts_at, e.ends_at)} &middot; {e.bay_ids.length} bay{e.bay_ids.length > 1 ? "s" : ""} &middot; {e.contact_name}</p>
      </div>
      <div className="text-right text-sm">
        <p className={e.status === "paid" ? "text-brand" : e.status === "cancelled" ? "text-neutral-500" : "text-amber-300"}>{STATUS[e.status]}</p>
        <p className="text-xs text-neutral-400">{money(e.amount_paid)} of {money(e.price_total)}</p>
      </div>
    </Link>
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-white">Private events</h1>
      <p className="mt-1 text-sm text-neutral-400">Agree a price, create the event here, and the customer gets a link to pay (deposit then balance, or in full). The bays are held as soon as you save.</p>

      <section className="mt-6 overflow-hidden rounded-xl border border-white/10">
        <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Upcoming</p>
        {upcoming.length ? upcoming.map(row) : <p className="border-t border-white/10 px-4 py-3 text-sm text-neutral-500">None yet.</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">New event</h2>
        <NewEventForm bays={(bays ?? []) as { id: string; name: string }[]} />
      </section>

      {past.length > 0 && (
        <section className="mt-8 overflow-hidden rounded-xl border border-white/10">
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Past and cancelled</p>
          {past.map(row)}
        </section>
      )}
    </main>
  )
}
