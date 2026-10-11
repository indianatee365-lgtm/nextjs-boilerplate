"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cancelEventAction, manualPaymentAction, resendLinkAction } from "../actions"

const field = "rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"

export default function EventControls({ eventId, url, cancelled, stripePayments }: {
  eventId: string; url: string; cancelled: boolean; stripePayments: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [refund, setRefund] = useState<string[]>(stripePayments.map((p) => p.id))

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setMsg("")
    try { setMsg(await fn()) } catch (e) { setMsg(String(e)) }
    setBusy(false)
    router.refresh()
  }

  if (cancelled) return <p className="mt-6 text-sm text-neutral-500">This event is cancelled. The bays are free again.</p>

  return (
    <div className="mt-6 space-y-5">
      <div>
        <p className="text-xs text-neutral-400">Payment link</p>
        <div className="mt-1 flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${field} w-full`} aria-label="Payment link" />
          <button type="button" className="btn-secondary px-3 text-xs" onClick={() => navigator.clipboard.writeText(url)}>Copy</button>
        </div>
        <button type="button" disabled={busy} className="mt-2 text-sm text-brand underline"
          onClick={() => run(async () => { const s = await resendLinkAction(eventId); return s.email || s.sms ? `Sent${s.email ? " by email" : ""}${s.sms ? " by text" : ""}.` : "Nothing sent (nothing left to pay, or no email/texts)." })}>
          Send the link again
        </button>
      </div>

      <div>
        <p className="text-xs text-neutral-400">Paid some other way (cash, check)?</p>
        <div className="mt-1 flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$" className={`${field} w-24`} aria-label="Amount" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. cash at the door" className={`${field} flex-1`} aria-label="Note" />
          <button type="button" disabled={busy || !amount} className="btn-secondary px-3 text-xs"
            onClick={() => run(async () => { const r = await manualPaymentAction(eventId, Number(amount), note); if (r.ok) { setAmount(""); setNote("") } return r.ok ? "Recorded." : r.error ?? "Failed." })}>
            Record
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-red-500/30 p-3">
        {!cancelling ? (
          <button type="button" className="text-sm text-red-400 underline" onClick={() => setCancelling(true)}>Cancel this event...</button>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-white">Cancel the event? Every bay is freed and the door code is cancelled.</p>
            {stripePayments.length > 0 && (
              <div>
                <p className="text-neutral-400">Refund to their card (untick anything you&apos;re keeping, e.g. a non-refundable deposit):</p>
                {stripePayments.map((p) => (
                  <label key={p.id} className="mt-1 flex items-center gap-2 text-neutral-200">
                    <input type="checkbox" checked={refund.includes(p.id)} onChange={() => setRefund(refund.includes(p.id) ? refund.filter((x) => x !== p.id) : [...refund, p.id])} />
                    {p.label}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-white"
                onClick={() => run(async () => { const r = await cancelEventAction(eventId, refund); return `Cancelled.${r.refunded ? ` Refunded $${r.refunded}.` : ""}${r.failed ? ` ${r.failed} refund(s) FAILED: do them in Stripe.` : ""}` })}>
                Yes, cancel the event
              </button>
              <button type="button" className="text-neutral-400 underline" onClick={() => setCancelling(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
      {msg && <p className="text-sm text-neutral-300">{msg}</p>}
    </div>
  )
}
