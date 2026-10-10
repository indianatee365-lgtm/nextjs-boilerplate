"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Commissioner only: mark holes a group couldn't play because the bay failed
 * (rules: "When the simulator acts up"). Those holes are halved in match play
 * and the round can't count toward the gross prize. Saving re-scores a match
 * that's already confirmed.
 */
export default function UnplayedHoles({ matchId, holesLabel, initial }: { matchId: string; holesLabel: number[]; initial: number[] }) {
  const router = useRouter()
  const [picked, setPicked] = useState<number[]>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const changed = JSON.stringify([...picked].sort()) !== JSON.stringify([...initial].sort())

  async function save() {
    setBusy(true)
    setMsg("")
    try {
      const res = await fetch("/api/leagues/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "unplayed", holes: picked }),
      })
      const data = await res.json().catch(() => ({}))
      setMsg(res.ok ? "Saved." : data.error ?? "Something went wrong.")
      if (res.ok) router.refresh()
    } catch {
      setMsg("Something went wrong. Check your connection and try again.")
    }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-xs font-semibold text-amber-200">Commissioner: holes not played because of a bay problem</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {holesLabel.map((h, i) => (
          <label key={h} className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-sm ${picked.includes(i) ? "border-amber-400 bg-amber-400/20 text-white" : "border-white/15 text-neutral-400"}`}>
            <input type="checkbox" className="sr-only" checked={picked.includes(i)} aria-label={`Hole ${h} not played`}
              onChange={() => setPicked(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i])} />
            {h}
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className="btn-secondary px-3 py-1.5 text-xs">{busy ? "Saving..." : "Save"}</button>
        {msg && <span className="text-xs text-neutral-300">{msg}</span>}
      </div>
    </div>
  )
}
