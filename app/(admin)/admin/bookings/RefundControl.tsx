"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { refundCancelledBooking } from "./actions"

// Refund money kept on a cancelled booking: a customer's own late cancel
// (forfeited by the rules) that Jerrod decides to make good on, or one
// cancelled outside the normal flow. Used in Manage Bookings and on
// /admin/cancellations. Confirmed in the page, never with a browser dialog.
export default function RefundControl({
  bookingId,
  remaining,
  customerName,
  compact = false,
}: {
  bookingId: string
  remaining: number
  customerName: string
  compact?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const parsed = Number(amount)
  const valid = Number.isFinite(parsed) && parsed > 0 && Math.round(parsed * 100) <= Math.round(remaining * 100)

  function submit() {
    setNote(null)
    startTransition(async () => {
      try {
        const result = await refundCancelledBooking(bookingId, parsed)
        setNote({ ok: true, text: result.message })
        setConfirming(false)
        router.refresh()
      } catch (err) {
        setNote({ ok: false, text: err instanceof Error ? err.message : "Refund failed" })
        setConfirming(false)
      }
    })
  }

  if (note?.ok) return <p className="text-xs text-green-400">{note.text}</p>

  return (
    <div className={compact ? "mt-1 space-y-1" : "space-y-2"}>
      {!confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            max={remaining.toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-20 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
          />
          <button
            type="button"
            disabled={!valid || isPending}
            onClick={() => setConfirming(true)}
            className="rounded-md border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-40"
          >
            Refund
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-white">
            Refund ${parsed.toFixed(2)} to {customerName}&apos;s card?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="rounded-md border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/20 disabled:opacity-40"
            >
              {isPending ? "Refunding…" : "Yes, refund"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {note && !note.ok && <p className="text-xs text-red-400">{note.text}</p>}
    </div>
  )
}
