"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { cancelBookingByCustomer } from "./actions"

export function CancelBookingButton({
  bookingId,
  startsAt,
  total,
}: {
  bookingId: string
  startsAt: string
  total: number
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const hoursUntil = (new Date(startsAt).getTime() - Date.now()) / (1000 * 60 * 60)
  const withinWindow = hoursUntil <= 24

  function handleCancel() {
    startTransition(async () => {
      await cancelBookingByCustomer(bookingId)
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-neutral-500 hover:text-red-400 underline transition-colors"
      >
        Cancel booking
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
      {withinWindow ? (
        <p className="text-xs text-red-300 leading-relaxed">
          Per our{" "}
          <a href="/terms" className="underline hover:text-white">cancellation policy</a>,
          cancellations within 24 hours of the session are non-refundable.{" "}
          <strong>You will forfeit your payment of ${total.toFixed(2)} in full.</strong>
        </p>
      ) : (
        <p className="text-xs text-neutral-300 leading-relaxed">
          Are you sure you want to cancel? You'll receive a full refund of{" "}
          <strong>${total.toFixed(2)}</strong> to your original payment method within 5–10 business days.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors"
        >
          {isPending ? "Cancelling…" : withinWindow ? "Yes, forfeit & cancel" : "Yes, cancel & refund"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 transition-colors"
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
