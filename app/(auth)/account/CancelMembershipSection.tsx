"use client"

import { useState, useTransition } from "react"
import { cancelMembership, reactivateMembership } from "./membership-actions"

// Optional "why" in the cancel box. Keep in sync with CANCEL_REASONS in
// membership-actions.ts.
const REASONS: [string, string][] = [
  ["auto_renew", "I just don't want it to auto-renew"],
  ["not_worth_it", "It's not worth it for how often I play"],
  ["one_booking", "I only needed it for one booking"],
  ["mistake", "I signed up by mistake"],
  ["other", "Something else"],
]

type Props = {
  planType: string
  planName: string
  isFounder: boolean
  founderNumber: number | null
  pendingCancelEndDate: string | null
}

export default function CancelMembershipSection({
  planType, planName, isFounder, founderNumber, pendingCancelEndDate,
}: Props) {
  const [showModal, setShowModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<string>("")
  const [note, setNote] = useState("")

  const handleCancel = () => {
    setError(null)
    startTransition(async () => {
      const res = await cancelMembership({ choice: reason || undefined, note })
      if (res.error) setError(res.error)
      else setShowModal(false)
    })
  }

  const handleReactivate = () => {
    setError(null)
    startTransition(async () => {
      const res = await reactivateMembership()
      if (res.error) setError(res.error)
    })
  }

  if (pendingCancelEndDate) {
    return (
      <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-yellow-200">Cancellation scheduled</p>
            <p className="mt-1 text-xs text-neutral-300">
              Your {planName} membership ends on <strong>{pendingCancelEndDate}</strong>. You keep full access until then.
            </p>
            {isFounder && (
              <p className="mt-2 text-xs text-neutral-400">
                Member #{founderNumber} is permanently yours. You can reactivate any time at your original terms.
              </p>
            )}
          </div>
          <button
            onClick={handleReactivate}
            disabled={isPending}
            className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 whitespace-nowrap"
          >
            {isPending ? "Working…" : "Reactivate"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <>
      <div className="mt-4 text-right">
        <button
          onClick={() => setShowModal(true)}
          className="text-xs text-neutral-500 hover:text-red-400 underline"
        >
          Cancel membership
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => !isPending && setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900 p-6">
            <h3 className="text-lg font-semibold text-white">Cancel your {planName} membership?</h3>
            <div className="mt-3 space-y-2 text-sm text-neutral-300">
              <p>You&apos;ll keep full access until the end of your current billing period. No further charges after that.</p>
              {isFounder && (
                <p className="rounded-lg bg-brand/10 border border-brand/30 px-3 py-2 text-xs text-neutral-200">
                  <strong className="text-brand">Founder #{founderNumber}</strong> is permanently yours.
                  You can reactivate any time at your original Founder&apos;s terms: same discount, same booking window, same number.
                </p>
              )}
              {planType === "founder" && (
                <p className="text-xs text-neutral-400">
                  The $199 joining fee is non-refundable after 30 days. If you&apos;re within 30 days, contact us at info@tee365.org for a refund.
                </p>
              )}
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-white">Mind telling us why? <span className="font-normal text-neutral-500">(optional)</span></legend>
              <div className="mt-2 space-y-1.5">
                {REASONS.map(([value, label]) => (
                  <label key={value} className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 text-sm text-neutral-200 hover:border-white/25">
                    <input type="radio" name="cancel-reason" value={value} checked={reason === value}
                      onChange={() => setReason(value)} className="h-4 w-4 accent-brand" />
                    {label}
                  </label>
                ))}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2}
                placeholder="Anything we could do better? (optional)"
                aria-label="Anything we could do better?"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-white/30" />
            </fieldset>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50"
              >
                Keep my membership
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {isPending ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
