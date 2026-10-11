"use client"

import { useState } from "react"
import { PARTY_ACK } from "@/components/parties/PartyRules"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
const money = (n: number) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`

export default function BuyTickets({ slug, price, max }: { slug: string; price: number; max: number }) {
  const [qty, setQty] = useState(1)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [smsOk, setSmsOk] = useState(false)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function buy(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/tickets/${slug}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty, name, email, phone, smsOk, ack }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) { setError(data.error ?? "Something went wrong. Try again."); setBusy(false); return }
      window.location.assign(data.url)
    } catch {
      setError("Something went wrong. Check your connection and try again.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={buy} className="space-y-3">
      <div>
        <label htmlFor="t-qty" className="block text-xs font-medium text-neutral-400">Tickets (one per person, any age)</label>
        <select id="t-qty" className={field} value={qty} onChange={(e) => setQty(Number(e.target.value))}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} &middot; {money(n * price)}</option>)}
        </select>
      </div>
      <div><label htmlFor="t-name" className="block text-xs font-medium text-neutral-400">Name</label><input id="t-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
      <div><label htmlFor="t-email" className="block text-xs font-medium text-neutral-400">Email (tickets and door code go here)</label><input id="t-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
      <div><label htmlFor="t-phone" className="block text-xs font-medium text-neutral-400">Phone (optional)</label><input id="t-phone" type="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></div>
      <label className="flex items-start gap-2 text-xs text-neutral-400">
        <input type="checkbox" className="mt-0.5" checked={smsOk} onChange={(e) => setSmsOk(e.target.checked)} />
        Text me the door code on the day. One message from Tee365; msg and data rates may apply.
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-neutral-200">
        <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} required />
        {PARTY_ACK}
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !ack} className="btn-primary w-full py-3">{busy ? "Opening secure checkout..." : `Buy ${qty} ticket${qty > 1 ? "s" : ""}: ${money(qty * price)}`}</button>
    </form>
  )
}
