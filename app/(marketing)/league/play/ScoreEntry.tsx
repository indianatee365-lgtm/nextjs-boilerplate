"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Player { userId: string; name: string; teamName: string; ab: "A" | "B" | null; handicap: number }
type Status = "played" | "absent" | "sub"

/**
 * Phone score entry for one match. Each player: played, absent, or played by
 * a sub (named). Under every box is that player's net double bogey max; a
 * higher number is kept but shown as what it counts as.
 * mode "enter" saves; "confirm" lets the other team confirm or dispute.
 */
export default function ScoreEntry({
  matchId,
  players,
  holesLabel,
  pars,
  initial,
  initialSubs,
  maxes,
  unplayed,
  mode,
  canEdit,
}: {
  matchId: string
  players: Player[]
  holesLabel: number[]
  pars: (number | null)[]
  initial: Record<string, number[] | null>
  initialSubs: Record<string, string>
  maxes: Record<string, number[] | null>
  /** Positions the commissioner marked unplayed because of a bay problem. */
  unplayed: number[]
  mode: "enter" | "confirm" | "view"
  canEdit: boolean
}) {
  const router = useRouter()
  const [cards, setCards] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(players.map((p) => [p.userId, (initial[p.userId] ?? Array(9).fill("")).map((v) => (v === "" ? "" : String(v)))])))
  const [status, setStatus] = useState<Record<string, Status>>(() =>
    Object.fromEntries(players.map((p) => [p.userId,
      initialSubs[p.userId] ? "sub" : (p.userId in initial && initial[p.userId] === null) ? "absent" : "played"])))
  const [subName, setSubName] = useState<Record<string, string>>(() => ({ ...initialSubs }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [disputing, setDisputing] = useState(false)
  const [note, setNote] = useState("")
  const editing = mode === "enter" && canEdit

  const counted = (id: string, i: number) => {
    if (unplayed.includes(i)) return 0
    const v = Number(cards[id]?.[i])
    const max = maxes[id]?.[i]
    return v && max ? Math.min(v, max) : v
  }
  const total = (id: string) => (cards[id] ?? []).reduce((t, _, i) => t + (counted(id, i) || 0), 0)

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
    const subs: Record<string, string> = {}
    for (const p of players) {
      if (status[p.userId] === "absent") { out[p.userId] = null; continue }
      out[p.userId] = cards[p.userId].map((v, i) => (unplayed.includes(i) ? 0 : Number(v)))
      if (status[p.userId] === "sub") {
        if (!subName[p.userId]?.trim()) { setError(`Who subbed for ${p.name}? Enter their name.`); return }
        subs[p.userId] = subName[p.userId].trim()
      }
    }
    post({ action: "enter", cards: out, subs })
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs text-neutral-400">
            <tr>
              <th className="sticky left-0 z-10 bg-neutral-900 px-2 py-2 text-left">Hole</th>
              {holesLabel.map((h) => <th key={h} className="px-1 py-2 text-center">{h}</th>)}
              <th className="px-2 py-2 text-center">Tot</th>
            </tr>
            {pars.some((p) => p) && (
              <tr><th className="sticky left-0 z-10 bg-neutral-900 px-2 py-1 text-left font-normal">Par</th>
                {pars.map((p, i) => <th key={i} className="px-1 py-1 text-center font-normal">{p ?? ""}</th>)}
                <th className="px-2 py-1 text-center font-normal">{pars.every((p) => p) ? pars.reduce((t, p) => t! + p!, 0) : ""}</th></tr>
            )}
          </thead>
          <tbody className="divide-y divide-white/5">
            {players.map((p) => {
              const st = status[p.userId]
              return (
                <tr key={p.userId} className="align-top">
                  <td className="sticky left-0 z-10 bg-neutral-900 px-2 py-2">
                    <div className="whitespace-nowrap font-medium text-white">{st === "sub" ? (subName[p.userId] || "Sub") : p.name}</div>
                    <div className="text-xs text-neutral-500">
                      {p.teamName}{p.ab ? ` · ${p.ab}` : ""} &middot; hcp {Math.round(p.handicap)}
                      {st === "sub" && <span className="block text-amber-300">sub for {p.name}</span>}
                    </div>
                    {editing && (
                      <div className="mt-1 space-y-1">
                        <select value={st} onChange={(e) => setStatus({ ...status, [p.userId]: e.target.value as Status })}
                          aria-label={`${p.name} played, absent or sub`}
                          className="rounded border border-white/15 bg-black/40 px-1 py-1 text-xs text-white">
                          <option value="played">Played</option>
                          <option value="sub">Sub played</option>
                          <option value="absent">Absent</option>
                        </select>
                        {st === "sub" && (
                          <input value={subName[p.userId] ?? ""} onChange={(e) => setSubName({ ...subName, [p.userId]: e.target.value })}
                            placeholder="Sub's name" aria-label={`Name of sub for ${p.name}`} maxLength={60}
                            className="block w-28 rounded border border-white/15 bg-black/40 px-1 py-1 text-xs text-white" />
                        )}
                      </div>
                    )}
                  </td>
                  {st === "absent"
                    ? <td colSpan={10} className="px-2 py-4 text-center text-xs text-neutral-500">Absent</td>
                    : (cards[p.userId] ?? []).map((v, i) => {
                      const max = maxes[p.userId]?.[i]
                      const over = Boolean(max && Number(v) > max)
                      if (unplayed.includes(i)) {
                        return <td key={i} className="px-0.5 py-2 text-center text-[10px] text-amber-300/80">bay</td>
                      }
                      return (
                        <td key={i} className="px-0.5 py-2 text-center">
                          {editing ? (
                            <input inputMode="numeric" pattern="[0-9]*" maxLength={2} value={v} aria-label={`${p.name} hole ${holesLabel[i]}`}
                              onChange={(e) => {
                                const next = [...cards[p.userId]]; next[i] = e.target.value.replace(/\D/g, "").slice(0, 2)
                                setCards({ ...cards, [p.userId]: next })
                              }}
                              className={`h-11 w-9 rounded-md border bg-black/30 text-center text-base text-white ${over ? "border-amber-400" : "border-white/15"}`} />
                          ) : <span className="block w-9 text-white">{v}</span>}
                          <span className={`block text-[10px] leading-4 ${over ? "text-amber-300" : "text-neutral-600"}`}>
                            {over ? `= ${max}` : max ? `≤${max}` : ""}
                          </span>
                        </td>
                      )
                    })}
                  {st !== "absent" && <td className="px-2 py-2 text-center font-semibold text-white">{total(p.userId) || ""}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Totals count each hole at no more than its max (net double bogey). An amber box was over the max and counts as the number under it.</p>

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
