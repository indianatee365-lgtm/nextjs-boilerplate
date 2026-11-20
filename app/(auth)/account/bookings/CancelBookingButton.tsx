"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { cancelBookingByCustomer } from "./actions"

type GroupBay = { id: string; name: string; total: number }

export function CancelBookingButton({
  bookingId,
  startsAt,
  total,
  bays,
}: {
  bookingId: string
  startsAt: string
  total: number
  /** Both bays of a two-bay booking: lets the customer cancel just one. */
  bays?: GroupBay[]
}) {
  // null = closed, "all" = whole booking, otherwise the id of the one bay.
  const [choice, setChoice] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const hoursUntil = (new Date(startsAt).getTime() - Date.now()) / (1000 * 60 * 60)
  const withinWindow = hoursUntil <= 24
  const isGroup = Boolean(bays && bays.length > 1)
  const oneBay = bays?.find((b) => b.id === choice)
  const amount = oneBay ? oneBay.total : total

  function handleCancel() {
    setError("")
    startTransition(async () => {
      try {
        if (oneBay) await cancelBookingByCustomer(oneBay.id, { onlyThisBay: true })
        else await cancelBookingByCustomer(bookingId)
        setChoice(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  function close() {
    setChoice(null)
    setPicking(false)
  }

  if (!choice && !picking) {
    return (
      <button
        onClick={() => (isGroup ? setPicking(true) : setChoice("all"))}
        className="text-xs text-neutral-500 hover:text-red-400 underline transition-colors"
      >
        Cancel booking
      </button>
    )
  }

  if (!choice && picking && bays) {
    return (
      <div className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
        <p className="text-xs text-neutral-300">What do you want to cancel?</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setChoice("all")} className="text-xs rounded-md border border-red-500/40 px-3 py-1.5 text-red-300 hover:bg-red-500/10">
            Both bays
          </button>
          {bays.map((b) => (
            <button key={b.id} onClick={() => setChoice(b.id)} className="text-xs rounded-md border border-white/15 px-3 py-1.5 text-neutral-200 hover:bg-white/5">
              Just {b.name}
            </button>
          ))}
          <button onClick={close} className="text-xs text-neutral-400 hover:text-white px-3 py-1.5">
            Never mind
          </button>
        </div>
      </div>
    )
  }

  const what = oneBay ? `${oneBay.name} only` : isGroup ? "both bays" : "this booking"

  return (
    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
      {withinWindow ? (
        <p className="text-xs text-red-300 leading-relaxed">
          Per our{" "}
          <a href="/terms" className="underline hover:text-white">cancellation policy</a>,
          cancellations within 24 hours of the session are non-refundable.{" "}
          <strong>Cancelling {what} forfeits ${amount.toFixed(2)}.</strong>
        </p>
      ) : (
        <p className="text-xs text-neutral-300 leading-relaxed">
          Cancel {what}? You&apos;ll receive a refund of{" "}
          <strong>${amount.toFixed(2)}</strong> to your original payment method within 5-10 business days.
          {oneBay && " Your other bay stays booked."}
        </p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors"
        >
          {isPending ? "Cancelling…" : withinWindow ? "Yes, forfeit & cancel" : "Yes, cancel & refund"}
        </button>
        <button
          onClick={close}
          disabled={isPending}
          className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 transition-colors"
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
