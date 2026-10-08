"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Player { userId: string; name: string; teamName: string }

/**
 * Phone score entry for one match: every player's 9 holes, or "absent".
 * mode "enter" saves; "confirm" lets the other team confirm or dispute.
 */
export default function ScoreEntry({
  matchId,
  players,
  holesLabel,
  pars,
  initial,
  mode,
  canEdit,
}: {
  matchId: string
  players: Player[]
  holesLabel: number[]
  pars: (number | null)[]
  initial: Record<string, number[] | null>
  mode: "enter" | "confirm" | "view"
  canEdit: boolean
}) {
  const router = useRouter()
  const [cards, setCards] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(players.map((p) => [p.userId, (initial[p.userId] ?? Array(9).fill("")).map((v) => (v === "" ? "" : String(v)))])))
  const [absent, setAbsent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(players.map((p) => [p.userId, p.userId in initial && initial[p.userId] === null])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [disputing, setDisputing] = useState(false)
  const [note, setNote] = useState("")
  const editing = mode === "enter" && canEdit

  const total = (id: string) => (cards[id] ?? []).reduce((t, v) => t + (Number(v) || 0), 0)

  async function post(payload: Record<string, unknown>) {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/leagues/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? "Something went wrong."); setBusy(false); return }
      router.refresh()
      setBusy(false)
    } catch {
      setError("Something went wrong. Check your connection and try again.")
      setBusy(false)
    }
  }

  function save() {
    const out: Record<string, number[] | null> = {}
    for (const p of players) out[p.userId] = absent[p.userId] ? null : cards[p.userId].map((v) => Number(v))
    post({ action: "enter", cards: out })
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs text-neutral-400">
            <tr>
              <th className="sticky left-0 bg-neutral-900 px-2 py-2 text-left">Hole</th>
              {holesLabel.map((h) => <th key={h} className="px-1 py-2 text-center">{h}</th>)}
              <th className="px-2 py-2 text-center">Tot</th>
            </tr>
            {pars.some((p) => p) && (
              <tr><th className="sticky left-0 bg-neutral-900 px-2 py-1 text-left font-normal">Par</th>
                {pars.map((p, i) => <th key={i} className="px-1 py-1 text-center font-normal">{p ?? ""}</th>)}
                <th className="px-2 py-1 text-center font-normal">{pars.every((p) => p) ? pars.reduce((t, p) => t! + p!, 0) : ""}</th></tr>
            )}
          </thead>
          <tbody className="divide-y divide-white/5">
            {players.map((p) => (
              <tr key={p.userId}>
                <td className="sticky left-0 bg-neutral-900 px-2 py-2">
                  <div className="whitespace-nowrap font-medium text-white">{p.name}</div>
                  <div className="text-xs text-neutral-500">{p.teamName}</div>
                  {editing && (
                    <label className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                      <input type="checkbox" checked={absent[p.userId]} onChange={(e) => setAbsent({ ...absent, [p.userId]: e.target.checked })} /> Absent
                    </label>
                  )}
                </td>
                {absent[p.userId]
                  ? <td colSpan={10} className="px-2 text-center text-xs text-neutral-500">Absent</td>
                  : (cards[p.userId] ?? []).map((v, i) => (
                    <td key={i} className="px-0.5 py-2">
                      {editing ? (
                        <input inputMode="numeric" pattern="[0-9]*" maxLength={2} value={v} aria-label={`${p.name} hole ${holesLabel[i]}`}
                          onChange={(e) => {
                            const next = [...cards[p.userId]]; next[i] = e.target.value.replace(/\D/g, "").slice(0, 2)
                            setCards({ ...cards, [p.userId]: next })
                          }}
                          className="h-11 w-9 rounded-md border border-white/15 bg-black/30 text-center text-base text-white" />
                      ) : <span className="block w-9 text-center text-white">{v}</span>}
                    </td>
                  ))}
                {!absent[p.userId] && <td className="px-2 text-center font-semibold text-white">{total(p.userId) || ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {editing && (
        <button onClick={save} disabled={busy} className="btn-primary w-full py-3">
          {busy ? "Saving..." : "Submit scores"}
        </button>
      )}

      {mode === "confirm" && canEdit && !disputing && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => post({ action: "confirm" })} disabled={busy} className="btn-primary py-3">{busy ? "..." : "Confirm, these are right"}</button>
          <button onClick={() => setDisputing(true)} disabled={busy} className="btn-secondary py-3">Something&apos;s wrong</button>
        </div>
      )}
      {disputing && (
        <div className="space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} aria-label="What's wrong?"
            placeholder="What's wrong? e.g. hole 4 for Mike was a 5, not a 4"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <button onClick={() => post({ action: "dispute", note })} disabled={busy || !note.trim()} className="btn-primary w-full py-3">
            Send to the commissioner
          </button>
        </div>
      )}
    </div>
  )
}
