"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Permanent, and the only control here that destroys data, so it asks for the
 * word DELETE typed out rather than a second click. Two clicks in a row is a
 * habit; typing is a decision.
 */
export default function DeleteAccountPanel({
  userId,
  name,
  deletedAt,
}: {
  userId: string
  name: string
  deletedAt: string | null
}) {
  const router = useRouter()
  const [stage, setStage] = useState<"idle" | "form">("idle")
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (deletedAt) {
    return (
      <div className="w-full min-w-[280px] sm:w-auto rounded-lg border border-white/15 bg-white/[0.02] p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Deleted</p>
        <p className="mt-1 text-xs text-neutral-500">
          Personal data removed{" "}
          {new Date(deletedAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            timeZone: "America/Indiana/Indianapolis",
          })}
          . The row survives only to hold their booking history.
        </p>
      </div>
    )
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      if (data.mode === "hard") {
        router.push("/admin/users")
      } else {
        setStage("idle")
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setBusy(false)
    }
  }

  if (stage === "form") {
    return (
      <div className="w-full min-w-[280px] sm:w-auto rounded-lg border border-red-500/40 bg-red-500/5 p-3">
        <p className="text-xs font-semibold text-red-300">Delete {name}?</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-neutral-400">
          <li>If they have never booked, everything is erased</li>
          <li>If they have booking history, the bookings stay as financial records and every personal detail is stripped</li>
          <li>Their login stops working and their email is released</li>
          <li>This cannot be undone</li>
        </ul>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={submit}
            disabled={busy || typed !== "DELETE"}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Delete account"}
          </button>
          <button
            onClick={() => { setStage("idle"); setTyped(""); setError(null) }}
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
      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
    >
      Delete account
    </button>
  )
}
