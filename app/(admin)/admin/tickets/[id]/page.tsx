import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { money, whenLabel } from "@/lib/events"
import { partyUrl, ticketCounts, type Order, type Party } from "@/lib/tickets"
import PartyControls from "./PartyControls"

export const dynamic = "force-dynamic"

/** "YYYY-MM-DDTHH:MM" in Eastern, for a datetime-local input. */
function easternLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Indiana/Indianapolis", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`
}

export default async function AdminPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((prof as { role: string } | null)?.role !== "admin") redirect("/account")

  const { id } = await params
  const { data } = await db.from("ticketed_events").select("*").eq("id", id).maybeSingle()
  const p = data as Party | null
  if (!p) notFound()
  const { sold, held } = await ticketCounts(db, id)
  const { data: od } = await db.from("ticket_orders").select("*").eq("event_id", id).in("status", ["paid", "refunded"]).order("paid_at")
  const orders = (od ?? []) as Order[]
  const revenue = orders.filter((o) => o.status === "paid").reduce((t, o) => t + Number(o.amount), 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/tickets" className="text-sm text-neutral-400 hover:text-white">&larr; Ticketed parties</Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">{p.title}</h1>
      <p className="mt-1 text-sm text-neutral-300">{whenLabel(p.starts_at, p.ends_at)}</p>
      <p className="mt-1 text-sm">
        <a href={partyUrl(p.slug)} className="text-brand underline" target="_blank" rel="noreferrer">{partyUrl(p.slug).replace("https://", "")}</a>
        <span className="ml-2 text-neutral-500">{p.status === "cancelled" ? "Cancelled" : p.published ? "On sale" : "Draft: hidden from the site"}</span>
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-neutral-400">Sold</p><p className="text-xl text-white">{sold} <span className="text-sm text-neutral-400">of {p.capacity}</span></p>{held > 0 && <p className="text-xs text-neutral-500">{held} in checkout</p>}</div>
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-neutral-400">Revenue</p><p className="text-xl text-white">{money(revenue)}</p></div>
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-neutral-400">Door code</p><p className="text-xl text-white">{p.door_pin && !p.door_revoked_at ? p.door_pin : "not yet"}</p><p className="text-xs text-neutral-500">{p.door_revoked_at ? "deleted after the party" : "made the day before"}</p></div>
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-400">Guest list</h2>
      <PartyControls
        party={{ id: p.id, title: p.title, description: p.description, ticketPrice: Number(p.ticket_price), capacity: p.capacity, maxPerOrder: p.max_per_order, salesCloseLocal: easternLocal(p.sales_close_at ?? p.starts_at), activities: p.activities, published: p.published, cancelled: p.status === "cancelled" }}
        orders={orders.map((o) => ({ id: o.id, name: o.name, email: o.email, phone: o.phone, quantity: o.quantity, amount: Number(o.amount), status: o.status, codeSent: Boolean(o.code_sent_at) }))}
      />
    </main>
  )
}
