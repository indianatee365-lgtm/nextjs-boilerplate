import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel } from "@/lib/events"
import { ticketCounts, type Party } from "@/lib/tickets"
import NewPartyForm from "./NewPartyForm"

export const dynamic = "force-dynamic"

export default async function AdminTicketsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((prof as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data } = await db.from("ticketed_events").select("*").order("starts_at", { ascending: false })
  const parties = await Promise.all(((data ?? []) as Party[]).map(async (p) => ({ p, ...(await ticketCounts(db, p.id)) })))
  const { data: bays } = await db.from("bays").select("id, name, number").eq("active", true).order("number")

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/events" className="text-sm text-neutral-400 hover:text-white">&larr; Private events</Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">Ticketed parties</h1>
      <p className="mt-1 text-sm text-neutral-400">Watch parties, contests, anything with tickets. Published parties show at the top of tee365.org/events.</p>

      <section className="mt-6 overflow-hidden rounded-xl border border-white/10">
        {parties.length ? parties.map(({ p, sold }) => (
          <Link key={p.id} href={`/admin/tickets/${p.id}`} className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 first:border-t-0 hover:bg-white/5">
            <div>
              <p className="font-medium text-white">{p.title}</p>
              <p className="text-xs text-neutral-400">{whenLabel(p.starts_at, p.ends_at)}</p>
            </div>
            <div className="text-right text-sm">
              <p className={p.status === "cancelled" ? "text-neutral-500" : p.published ? "text-brand" : "text-amber-300"}>{p.status === "cancelled" ? "Cancelled" : p.published ? "On sale" : "Draft (hidden)"}</p>
              <p className="text-xs text-neutral-400">{sold} of {p.capacity} sold &middot; {money(sold * Number(p.ticket_price))}</p>
            </div>
          </Link>
        )) : <p className="px-4 py-3 text-sm text-neutral-500">No parties yet.</p>}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">New party</h2>
        <NewPartyForm bays={(bays ?? []) as { id: string; name: string }[]} />
      </section>
    </main>
  )
}
