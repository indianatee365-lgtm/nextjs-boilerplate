"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Shown only when the account has a cancelled membership and no live one.
 * Two-step on purpose: this creates a real Stripe subscription and charges a
 * real card, so a stray click on a customer page should not be able to do it.
 */
export default function ReinstateMembershipButton({
  userId,
  planLabel,
  founderNumber,
}: {
  userId: string
  planLabel: string
  founderNumber: number | null
}) {
  const router = useRouter()
  const [state, setState] = useState<"idle" | "confirming" | "working" | "done" | "error">("idle")
  const [message, setMessage] = useState("")
  const [override, setOverride] = useState(false)

  async function reinstate() {
    setState("working")
    try {
      const res = await fetch("/api/admin/reinstate-membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, overrideCooldown: override }),
      })
      const data = await res.json()
      setMessage(data.message ?? data.error ?? "Something went wrong")
      if (!res.ok || !data.ok) {
        setState("error")
        return
      }
      setState("done")
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed")
      setState("error")
    }
  }

  if (state === "done") {
    return <p className="mt-2 text-xs leading-relaxed text-green-400">{message}</p>
  }

  const founderTag = founderNumber ? ` Founder #${founderNumber} is kept.` : ""

  return (
    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      {state === "confirming" ? (
        <>
          <p className="text-xs leading-relaxed text-neutral-300">
            Restart this member&apos;s {planLabel} at their original rate, with no joining fee.
            {founderTag} This creates a live Stripe subscription and charges the card on file now.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={reinstate}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black hover:brightness-95"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Yes, reinstate
            </button>
            <button
              onClick={() => setState("idle")}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Override once-a-year limit
            </label>
          </div>
        </>
      ) : (
        <button
          onClick={() => setState("confirming")}
          disabled={state === "working"}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black hover:brightness-95 disabled:opacity-50"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {state === "working" ? "Reinstating..." : "Reinstate membership"}
        </button>
      )}
      {state === "error" && <p className="mt-2 text-xs leading-relaxed text-red-400">{message}</p>}
    </div>
  )
}
