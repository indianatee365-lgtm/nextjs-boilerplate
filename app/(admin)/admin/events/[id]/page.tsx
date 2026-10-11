import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { eventBayNames, eventUrl, money, whenLabel, type EventRow } from "@/lib/events"
import EventControls from "./EventControls"

export const dynamic = "force-dynamic"

const dateLabel = (key: string | null) => (key ? new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "not set")

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") redirect("/account")

  const { id } = await params
  const { data } = await db.from("events").select("*").eq("id", id).maybeSingle()
  const e = data as EventRow | null
  if (!e) notFound()
  const [bayNames, { data: pays }] = await Promise.all([
    eventBayNames(db, e.id),
    db.from("event_payments").select("*").eq("event_id", id).order("paid_at"),
  ])
  const payments = (pays ?? []) as { id: string; kind: string; amount: number; status: string; note: string | null; paid_at: string; stripe_payment_intent_id: string | null }[]

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/events" className="text-sm text-neutral-400 hover:text-white">&larr; Events</Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">{e.title}</h1>
      <p className="mt-1 text-sm text-neutral-300">{whenLabel(e.starts_at, e.ends_at)}</p>
      <p className="text-sm text-neutral-400">{bayNames.join(", ")}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-neutral-400">Customer</p>
          <p className="text-white">{e.contact_name}</p>
          <p className="text-neutral-400">{e.contact_phone ?? ""}{e.sms_ok ? " (texts OK)" : ""}</p>
          <p className="text-neutral-400">{e.contact_email ?? "no email"}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-neutral-400">Money</p>
          <p className="text-white">{money(e.amount_paid)} paid of {money(e.price_total)}</p>
          <p className="text-neutral-400">{e.deposit_amount ? `Deposit ${money(e.deposit_amount)}, due ${dateLabel(e.pay_by)}; balance due ${dateLabel(e.balance_due)}` : `Due ${dateLabel(e.pay_by)}`}</p>
          <p className={e.status === "paid" ? "text-brand" : e.status === "cancelled" ? "text-neutral-500" : "text-amber-300"}>
            {e.status === "awaiting_payment" ? "Awaiting payment" : e.status === "deposit_paid" ? "Deposit paid" : e.status === "paid" ? "Paid in full" : "Cancelled"}
          </p>
        </div>
      </div>
      {e.notes && <p className="mt-3 rounded-xl border border-white/10 p-3 text-sm text-neutral-300">{e.notes}</p>}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-neutral-400">Payments</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-white/10 text-sm">
        {payments.length ? payments.map((x) => (
          <div key={x.id} className="flex justify-between border-t border-white/10 px-3 py-2 first:border-t-0">
            <span className="text-neutral-300">{new Date(x.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} &middot; {x.kind}{x.note ? ` (${x.note})` : ""}</span>
            <span className={x.status === "refunded" ? "text-neutral-500 line-through" : "text-white"}>{money(x.amount)}</span>
          </div>
        )) : <p className="px-3 py-2 text-neutral-500">Nothing paid yet.</p>}
      </div>

      <EventControls
        eventId={e.id}
        url={eventUrl(e.token)}
        cancelled={e.status === "cancelled"}
        stripePayments={payments.filter((x) => x.status === "paid" && x.stripe_payment_intent_id).map((x) => ({ id: x.id, label: `${x.kind} ${money(x.amount)}` }))}
      />
    </main>
  )
}
