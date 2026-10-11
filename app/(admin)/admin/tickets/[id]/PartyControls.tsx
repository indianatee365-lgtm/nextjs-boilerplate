"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cancelPartyAction, deletePartyAction, refundOrderAction, updatePartyAction } from "../actions"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
const label = "block text-xs font-medium text-neutral-400"
const money = (n: number) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`

interface PartyEdit {
  id: string; title: string; description: string; details: string; ticketPrice: number; capacity: number; maxPerOrder: number
  salesCloseLocal: string; activities: { bay: string; label: string }[]; published: boolean; cancelled: boolean
}
interface OrderRow { id: string; name: string; email: string; phone: string | null; quantity: number; amount: number; status: string; codeSent: boolean }

export default function PartyControls({ party, orders }: { party: PartyEdit; orders: OrderRow[] }) {
  const router = useRouter()
  const [f, setF] = useState({ ...party, ticketPrice: String(party.ticketPrice), capacity: String(party.capacity), maxPerOrder: String(party.maxPerOrder) })
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setMsg("")
    try { setMsg(await fn()) } catch (e) { setMsg(String(e)) }
    setBusy(false)
    router.refresh()
  }

  const paid = orders.filter((o) => o.status === "paid")
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-white/10 text-sm">
        {orders.length ? orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 first:border-t-0">
            <div>
              <p className={o.status === "refunded" ? "text-neutral-500 line-through" : "text-white"}>{o.name} &middot; {o.quantity} ticket{o.quantity > 1 ? "s" : ""}</p>
              <p className="text-xs text-neutral-500">{o.email}{o.phone ? ` · ${o.phone}` : ""}{o.codeSent ? " · code sent" : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-neutral-300">{money(o.amount)}</span>
              {o.status === "paid" && !party.cancelled && (
                <button type="button" disabled={busy} className="text-xs text-red-400 underline"
                  onClick={() => { if (window.confirm(`Refund ${o.name} ${money(o.amount)}?`)) run(async () => { const r = await refundOrderAction(party.id, o.id); return r.ok ? `Refunded ${o.name}.` : r.error ?? "Failed." }) }}>
                  Refund
                </button>
              )}
              {o.status === "refunded" && <span className="text-xs text-neutral-500">refunded</span>}
            </div>
          </div>
        )) : <p className="px-3 py-2 text-neutral-500">No tickets sold yet.</p>}
      </div>
      {paid.length > 0 && <p className="text-xs text-neutral-500">{paid.reduce((t, o) => t + o.quantity, 0)} people on the list.</p>}

      {!party.cancelled && (
        <form className="space-y-3 rounded-xl border border-white/10 p-4"
          onSubmit={(e) => { e.preventDefault(); run(async () => {
            const r = await updatePartyAction(party.id, {
              title: f.title, description: f.description, details: f.details, ticketPrice: Number(f.ticketPrice), capacity: Number(f.capacity),
              maxPerOrder: Number(f.maxPerOrder), salesCloseAt: f.salesCloseLocal, activities: f.activities, published: f.published,
            })
            return r.ok ? "Saved." : r.error ?? "Failed."
          }) }}>
          <p className="text-sm font-semibold text-white">Edit</p>
          <div><label className={label} htmlFor="e-title">Name</label><input id="e-title" className={field} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div><label className={label} htmlFor="e-desc">Description</label><textarea id="e-desc" rows={3} className={field} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div><label className={label} htmlFor="e-details">Good to know (one per line)</label><textarea id="e-details" rows={4} className={field} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder={"Food and drinks provided\nBring a bag chair"} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={label} htmlFor="e-price">Ticket price ($)</label><input id="e-price" inputMode="decimal" className={field} value={f.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} /></div>
            <div><label className={label} htmlFor="e-cap">Capacity</label><input id="e-cap" inputMode="numeric" className={field} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} /></div>
            <div><label className={label} htmlFor="e-max">Max per order</label><input id="e-max" inputMode="numeric" className={field} value={f.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} /></div>
          </div>
          <div><label className={label} htmlFor="e-close">Sales close (Eastern)</label><input id="e-close" type="datetime-local" className={field} value={f.salesCloseLocal} onChange={(e) => set("salesCloseLocal", e.target.value)} /></div>
          {f.activities.map((a, i) => (
            <div key={a.bay}><label className={label} htmlFor={`e-act-${i}`}>{a.bay}</label>
              <input id={`e-act-${i}`} className={field} value={a.label} onChange={(e) => set("activities", f.activities.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></div>
          ))}
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} /> On sale (shown on tee365.org/events)
          </label>
          <p className="text-xs text-neutral-500">A new price applies to new orders only. Date, time and bays can&apos;t change once created: cancel and recreate instead.</p>
          <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">Save</button>
        </form>
      )}

      {!party.cancelled && (
        <div className="rounded-xl border border-red-500/30 p-3 text-sm">
          {!confirmCancel ? (
            <button type="button" className="text-red-400 underline" onClick={() => setConfirmCancel(true)}>Cancel this party...</button>
          ) : (
            <div className="space-y-2">
              <p className="text-white">Cancel the party? Every ticket is refunded ({paid.length} order{paid.length === 1 ? "" : "s"}), buyers get an email, the bays and door code are released.</p>
              <div className="flex gap-3">
                <button type="button" disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-white"
                  onClick={() => run(async () => { const r = await cancelPartyAction(party.id); return `Cancelled. ${r.refunded} order(s) refunded.${r.failed ? ` ${r.failed} refund(s) FAILED: do them in Stripe.` : ""}` })}>
                  Yes, cancel and refund everyone
                </button>
                <button type="button" className="text-neutral-400 underline" onClick={() => setConfirmCancel(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      )}
      {party.cancelled && (
        <div className="rounded-xl border border-white/10 p-3 text-sm">
          <p className="text-neutral-400">This party is cancelled. Delete it to clear it from the list (refunds stay on record in Stripe).</p>
          <button type="button" disabled={busy} className="mt-2 text-red-400 underline"
            onClick={async () => { if (!window.confirm("Delete this cancelled party for good?")) return; setBusy(true); const r = await deletePartyAction(party.id); if (r.ok) router.push("/admin/tickets"); else { setMsg(r.error ?? "Failed."); setBusy(false) } }}>
            Delete party
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-neutral-300">{msg}</p>}
    </div>
  )
}
