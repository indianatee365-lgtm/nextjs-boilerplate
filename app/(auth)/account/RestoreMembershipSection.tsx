"use client"

import { useState, useTransition } from "react"
import { restoreMembership } from "./membership-actions"

type Props = {
  planName: string
  priceMonthly: string
  isFounder: boolean
  founderNumber: number | null
}

/**
 * Shown to a member whose membership actually lapsed. Until this existed the
 * only thing on offer here was a "Rejoin" link to /join, which for a founder
 * returns 409 because founder enrollment closed 8/19/26, and which for anyone
 * else would have charged a joining fee they already paid.
 */
export default function RestoreMembershipSection({
  planName, priceMonthly, isFounder, founderNumber,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [needsCard, setNeedsCard] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const handleRestore = () => {
    setError(null)
    setNeedsCard(false)
    startTransition(async () => {
      const res = await restoreMembership()
      if (res.error) {
        setError(res.error)
        setNeedsCard(res.needsCard === true)
      } else {
        setDone(res.message ?? "Your membership is active again.")
      }
    })
  }

  if (done) {
    return (
      <div className="mt-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-4">
        <p className="text-sm font-semibold text-brand">Welcome back.</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-300">{done}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-4">
      <p className="text-sm font-semibold text-white">Restore your {planName} membership</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-300">
        Pick up exactly where you left off at ${priceMonthly}/mo, your original rate. There&apos;s no joining fee, because you already paid it.
        {isFounder && founderNumber ? ` You keep member #${founderNumber} and your founder discount.` : ""}
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        Your card on file is charged today and billing restarts monthly. You can cancel again any time.
      </p>

      <button
        onClick={handleRestore}
        disabled={isPending}
        className="mt-3 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {isPending ? "Restoring…" : "Restore my membership"}
      </button>

      {error && (
        <p className="mt-2 text-xs leading-relaxed text-red-400">
          {error}{" "}
          {needsCard && (
            <a href="#payment-method" className="text-brand underline underline-offset-2">
              Add a card
            </a>
          )}
        </p>
      )}
    </div>
  )
}
