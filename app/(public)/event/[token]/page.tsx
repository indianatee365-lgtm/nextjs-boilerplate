import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { eventBayNames, money, payOptions, whenLabel, type EventRow } from "@/lib/events"
import PayButtons from "./PayButtons"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your event | Tee365", robots: { index: false } }

const dateLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })

export default async function EventPayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params
  const { paid } = await searchParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data } = await db.from("events").select("*").eq("token", token).maybeSingle()
  const e = data as EventRow | null
  if (!e) notFound()
  const bayNames = await eventBayNames(db, e.id)
  const opts = payOptions(e)
  const left = Math.max(0, Number(e.price_total) - Number(e.amount_paid))

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Tee365 private event</p>
      <h1 className="mt-1 text-2xl font-semibold text-white">{e.title}</h1>
      <p className="mt-2 text-sm text-neutral-300">{whenLabel(e.starts_at, e.ends_at)}</p>
      <p className="text-sm text-neutral-400">{bayNames.length === 0 ? "" : bayNames.length === 1 ? `${bayNames[0]} · ` : `${bayNames.length} bays: ${bayNames.join(", ")} · `}4615 Grape Rd, Mishawaka</p>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
        <div className="flex justify-between text-neutral-300"><span>Total</span><span>{money(e.price_total)}</span></div>
        <div className="mt-1 flex justify-between text-neutral-300"><span>Paid</span><span>{money(e.amount_paid)}</span></div>
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold text-white"><span>Left to pay</span><span>{money(left)}</span></div>
        {e.status === "awaiting_payment" && e.deposit_amount && (
          <p className="mt-2 text-xs text-neutral-400">
            Deposit {money(e.deposit_amount)}{e.pay_by ? ` due by ${dateLabel(e.pay_by)}` : ""}; balance due by {dateLabel(e.balance_due!)}.
          </p>
        )}
        {e.status === "deposit_paid" && e.balance_due && <p className="mt-2 text-xs text-neutral-400">Balance due by {dateLabel(e.balance_due)}.</p>}
        {e.status === "awaiting_payment" && !e.deposit_amount && e.pay_by && <p className="mt-2 text-xs text-neutral-400">Due by {dateLabel(e.pay_by)}.</p>}
      </div>

      {paid && opts.length > 0 && <p className="mt-4 text-sm text-brand">Thanks! If you just paid, it can take a minute to show here. Refresh shortly.</p>}
      {e.status === "cancelled" ? (
        <p className="mt-6 text-sm text-neutral-300">This event was cancelled. Questions? Call (574) 444-9365.</p>
      ) : opts.length === 0 ? (
        <p className="mt-6 text-sm text-white">You&apos;re paid in full. See you there! Your door code comes shortly before the start.</p>
      ) : (
        <div className="mt-6"><PayButtons token={token} options={opts} /></div>
      )}
      <p className="mt-8 text-xs text-neutral-500">Secure payment by Stripe. Questions? Call (574) 444-9365.</p>
    </main>
  )
}
