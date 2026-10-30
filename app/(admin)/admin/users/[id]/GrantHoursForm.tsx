"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { grantHoursToUser } from "../../hour-credits/actions"

// Same grant as Hour Credits' "Grant to an account", from the customer's own
// page so there is no second lookup by email (Jerrod 2026-10-29).
export default function GrantHoursForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [granted, setGranted] = useState<string | null>(null)

  function submit(formData: FormData) {
    setError(null)
    setGranted(null)
    startTransition(async () => {
      try {
        await grantHoursToUser(formData)
        setGranted(`${formData.get("hours")}h granted`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grant hours")
      }
    })
  }

  return (
    <form action={submit} className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <input type="hidden" name="user_id" value={userId} />
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_10rem_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="grant-hours">Hours</label>
          <input id="grant-hours" name="hours" type="number" step="0.5" min="0.5" max="24" defaultValue="1" required className="input mt-1" />
        </div>
        <div>
          <label className="label" htmlFor="grant-reason">Reason</label>
          <input id="grant-reason" name="reason" type="text" placeholder="e.g. Service recovery" className="input mt-1" />
        </div>
        <div>
          <label className="label" htmlFor="grant-expires">Expires (optional)</label>
          <input id="grant-expires" name="expires_at" type="date" className="input mt-1" />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary whitespace-nowrap disabled:opacity-50">
          {isPending ? "Granting..." : "Grant hours"}
        </button>
      </div>
      {granted && <p className="mt-2 text-xs text-green-400">{granted}</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </form>
  )
}
