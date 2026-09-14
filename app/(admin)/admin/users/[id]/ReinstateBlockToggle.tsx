"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Controls whether this account can restore its own lapsed membership from
 * /account. Blocking does not stop them booking a bay.
 */
export default function ReinstateBlockToggle({
  userId,
  blocked,
  reason,
}: {
  userId: string
  blocked: boolean
  reason: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState("")

  async function apply(nextBlocked: boolean, nextReason?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/reinstate-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, blocked: nextBlocked, reason: nextReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setAsking(false)
      setWhy("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  if (blocked) {
    return (
      <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
        <p className="text-xs font-semibold text-red-300">Self-service restore is blocked</p>
        {reason && <p className="mt-1 text-xs text-neutral-400">Reason: {reason}</p>}
        <p className="mt-1 text-xs text-neutral-500">They can still book a bay. This only blocks restoring a lapsed membership from /account.</p>
        <button
          onClick={() => apply(false)}
          disabled={busy}
          className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-50"
        >
          {busy ? "Working..." : "Allow self-service restore"}
        </button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  if (asking) {
    return (
      <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs text-neutral-300">Why is this account blocked from restoring its own membership?</p>
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Removed under alcohol policy, chargeback, etc."
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => apply(true, why.trim())}
            disabled={busy || !why.trim()}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? "Working..." : "Block restore"}
          </button>
          <button
            onClick={() => setAsking(false)}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setAsking(true)}
      className="mt-2 text-xs text-neutral-600 underline underline-offset-2 hover:text-red-400"
    >
      Block self-service restore
    </button>
  )
}
