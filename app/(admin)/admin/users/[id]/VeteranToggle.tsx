"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Manual veteran verification.
 *
 * There is deliberately no file upload here and there never should be. The shop
 * is unattended, so nobody can look at a card and hand it back, and a DD-214
 * carries a full SSN. The admin confirms they have seen proof; the proof itself
 * stays with the customer.
 */
export default function VeteranToggle({
  userId,
  verifiedAt,
  source,
  discountPercent,
}: {
  userId: string
  verifiedAt: string | null
  source: string | null
  discountPercent: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function apply(veteran: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/veteran-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, veteran }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setConfirming(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  if (verifiedAt) {
    const when = new Date(verifiedAt).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      timeZone: "America/Indiana/Indianapolis",
    })
    return (
      <div className="w-full min-w-[280px] sm:w-auto rounded-lg border border-brand/30 bg-brand/10 p-3">
        <p className="text-xs font-semibold text-brand">
          Military &amp; veteran &middot; {discountPercent}% off every booking
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Since {when}
          {source === "govx" ? ", self-verified through GovX ID" : ", granted by an admin"}
        </p>
        <button
          onClick={() => apply(false)}
          disabled={busy}
          className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-50"
        >
          {busy ? "Working..." : "Remove military discount"}
        </button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="w-full min-w-[280px] sm:w-auto rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs text-neutral-300">
          Apply the military and veteran discount? They will get {discountPercent}% off
          bay time on every future booking, permanently.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Never ask for or keep a DD-214, VA card or military ID. A DD-214 carries a full
          SSN, and the discount is worth a few dollars a booking. If someone sends a photo
          anyway, delete it and apply the discount.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => apply(true)}
            disabled={busy}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working..." : "Confirm and apply"}
          </button>
          <button
            onClick={() => setConfirming(false)}
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
      onClick={() => setConfirming(true)}
      className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition border-brand/30 text-brand hover:bg-brand/10"
    >
      Grant military discount
    </button>
  )
}
