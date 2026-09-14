"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Ban control. Deliberately heavier than the other buttons on this page:
 * a reason is mandatory, emailing is an explicit choice, and the confirm
 * step spells out what will actually happen. Banning revokes door codes,
 * which cannot be undone by unbanning.
 */
export default function BanCustomerPanel({
  userId,
  name,
  banned,
  reason,
  bannedAt,
}: {
  userId: string
  name: string
  banned: boolean
  reason: string | null
  bannedAt: string | null
}) {
  const router = useRouter()
  const [stage, setStage] = useState<"idle" | "form" | "working" | "done">("idle")
  const [why, setWhy] = useState("")
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function submit(nextBanned: boolean) {
    setStage("working")
    setError(null)
    try {
      const res = await fetch("/api/admin/ban-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, banned: nextBanned, reason: why, notify }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? data.message ?? "Failed")
      setResult(data.message)
      setStage("done")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setStage(nextBanned ? "form" : "idle")
    }
  }

  if (stage === "done" && result) {
    return (
      <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
        <p className="text-xs leading-relaxed text-yellow-100">{result}</p>
      </div>
    )
  }

  if (banned) {
    return (
      <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Banned</p>
        {reason && <p className="mt-1 text-xs text-neutral-300">Reason: {reason}</p>}
        {bannedAt && (
          <p className="mt-0.5 text-xs text-neutral-500">
            Since {new Date(bannedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
        <p className="mt-1.5 text-xs text-neutral-500">
          Cannot book on any channel and cannot restore a membership. Door codes issued before the ban were revoked.
        </p>
        <button
          onClick={() => submit(false)}
          disabled={stage === "working"}
          className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-50"
        >
          {stage === "working" ? "Working..." : "Lift ban"}
        </button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  if (stage === "form" || stage === "working") {
    return (
      <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
        <p className="text-xs font-semibold text-red-300">Ban {name}?</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-neutral-400">
          <li>Blocks booking on the website and by phone</li>
          <li>Revokes door codes on any upcoming sessions, which cannot be undone</li>
          <li>Blocks restoring a membership</li>
          <li>Does not cancel or refund existing bookings, you decide that after</li>
        </ul>
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Reason (required, appears in the email if you send one)"
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600"
        />
        <label className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email them the notice
        </label>
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => submit(true)}
            disabled={stage === "working" || !why.trim()}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {stage === "working" ? "Working..." : "Ban this customer"}
          </button>
          <button
            onClick={() => setStage("idle")}
            disabled={stage === "working"}
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
      onClick={() => setStage("form")}
      className="mt-4 text-xs text-neutral-600 underline underline-offset-2 hover:text-red-400"
    >
      Ban this customer
    </button>
  )
}
