"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { joinFreeAgentsAction, leaveFreeAgentsAction } from "./free-agent-action"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"

/** "No partner?" on /league: join the free agent list, or see where you stand. */
export default function FreeAgentJoin({ status, teeTimes }: {
  status: "none" | "waiting" | "paired"
  teeTimes: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [handicap, setHandicap] = useState("")
  const [teePref, setTeePref] = useState("either")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  if (status === "paired") {
    return <p className="mt-6 rounded-xl border border-brand/40 bg-brand/10 p-4 text-sm text-neutral-200">You&apos;ve been paired with a partner. Check your email for who it is and the next step.</p>
  }
  if (status === "waiting") {
    return (
      <div className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-neutral-300">
        <p><span className="font-semibold text-white">You&apos;re on the free agent list.</span> We&apos;ll pair you with a player at a similar level and email you both. Nothing is charged until your team is confirmed.</p>
        <button type="button" className="mt-2 text-xs text-neutral-400 underline" onClick={async () => { await leaveFreeAgentsAction(); router.refresh() }}>Take me off the list</button>
      </div>
    )
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await joinFreeAgentsAction({ handicap, teePref, notes }).catch(() => ({ ok: false as const, error: "Couldn't add you. Please try again." }))
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.refresh()
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <p className="text-sm font-semibold text-white">No partner?</p>
      <p className="mt-1 text-sm text-neutral-400">Join the free agent list and we&apos;ll pair you with a player at a similar level. Nothing is charged until your team is confirmed.</p>
      {!open ? (
        <button type="button" className="btn-secondary mt-3 px-4 py-2 text-sm" onClick={() => setOpen(true)}>Find me a partner</button>
      ) : (
        <form onSubmit={join} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-400" htmlFor="fa-hcp">Handicap or usual 18-hole score</label>
              <input id="fa-hcp" className={field} value={handicap} onChange={(e) => setHandicap(e.target.value)} placeholder="12, or usually shoot 95" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400" htmlFor="fa-tee">Tee time</label>
              <select id="fa-tee" className={field} value={teePref} onChange={(e) => setTeePref(e.target.value)}>
                <option value="either">Either</option>
                {teeTimes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400" htmlFor="fa-notes">Anything we should know? (optional)</label>
            <input id="fa-notes" className={field} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Relaxed round, first league, etc." />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">{busy ? "Adding you..." : "Put me on the list"}</button>
        </form>
      )}
    </div>
  )
}
