"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import CustomerSearch from "../events/CustomerSearch"
import { addFreeAgentAction, pairFreeAgentsAction, removeFreeAgentAction, unpairFreeAgentAction } from "./free-agent-actions"
import { captainSignupUrl, teePrefLabel, type FreeAgent } from "@/lib/league/free-agents"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
const label = "block text-xs font-medium text-neutral-400"
const blank = { userId: null as string | null, name: "", phone: "", email: "", handicap: "", teePref: "either", notes: "" }

export default function FreeAgents({ agents, teeTimes, onTeam }: { agents: FreeAgent[]; teeTimes: { value: string; label: string }[]; onTeam: string[] }) {
  const router = useRouter()
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [captain, setCaptain] = useState("")
  const [partner, setPartner] = useState("")
  const waiting = agents.filter((a) => a.status === "waiting")
  const byId = new Map(agents.map((a) => [a.id, a]))
  const pairs = agents.filter((a) => a.status === "paired" && a.is_captain)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg("")
    const res = await addFreeAgentAction(f).catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    setBusy(false)
    if (!res.ok) { setMsg(res.error); return }
    setF(blank)
    setMsg("Added to the free agent list.")
    router.refresh()
  }

  async function pair() {
    setBusy(true)
    setMsg("")
    const res = await pairFreeAgentsAction(captain, partner).catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    setBusy(false)
    if (!res.ok) { setMsg(res.error); return }
    setCaptain("")
    setPartner("")
    setMsg(`Paired. ${res.emails} email${res.emails === 1 ? "" : "s"} sent. Give them a call too.`)
    router.refresh()
  }

  const who = (a: FreeAgent) => (
    <>
      <span className="font-medium text-white">{a.name}</span>
      {a.handicap && <span className="text-neutral-400"> · {a.handicap}</span>}
      <span className="text-neutral-500"> · {teePrefLabel(a.tee_pref)}</span>
      <div className="text-xs text-neutral-500">{[a.phone, a.email].filter(Boolean).join(" · ")}{a.source === "self" ? " · signed up online" : ""}</div>
      {a.notes && <div className="text-xs text-neutral-400">{a.notes}</div>}
    </>
  )

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-white">Free agents ({waiting.length} waiting)</h2>
      <p className="mt-1 text-sm text-neutral-400">Single players looking for a partner. Nobody is charged until they&apos;re on a confirmed team.</p>

      <form onSubmit={add} className="mt-4 space-y-3 rounded-xl border border-white/10 p-4">
        <CustomerSearch onPick={(c) => setF({ ...f, userId: c.id, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(), phone: c.phoneFormatted, email: c.email ?? "" })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2"><label className={label} htmlFor="fa-name">Name</label><input id="fa-name" className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, userId: null })} required /></div>
          <div><label className={label} htmlFor="fa-phone">Phone</label><input id="fa-phone" className={field} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className={label} htmlFor="fa-email">Email</label><input id="fa-email" type="email" className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="col-span-2"><label className={label} htmlFor="fa-hcp">Handicap or usual score</label><input id="fa-hcp" className={field} value={f.handicap} onChange={(e) => setF({ ...f, handicap: e.target.value })} placeholder="12 index, or usually shoots 95" /></div>
          <div className="col-span-2"><label className={label} htmlFor="fa-tee">Tee time</label>
            <select id="fa-tee" className={field} value={f.teePref} onChange={(e) => setF({ ...f, teePref: e.target.value })}>
              <option value="either">Either</option>
              {teeTimes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div><label className={label} htmlFor="fa-notes">Notes</label><textarea id="fa-notes" rows={2} className={field} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Called 10/14, wants a relaxed partner" /></div>
        <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm">Add free agent</button>
        {msg && <p className="text-sm text-amber-200">{msg}</p>}
      </form>

      {waiting.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <ul className="divide-y divide-white/5 text-sm">
            {waiting.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-3 py-2 text-neutral-300">
                <div>{who(a)}</div>
                <button type="button" className="shrink-0 text-xs text-red-400 hover:underline" onClick={async () => { await removeFreeAgentAction(a.id); router.refresh() }}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {waiting.length >= 2 && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 p-4 text-sm">
          <div><label className={label} htmlFor="fa-cap">Captain (signs up the team)</label>
            <select id="fa-cap" className={field} value={captain} onChange={(e) => setCaptain(e.target.value)}>
              <option value="">Pick a player</option>
              {waiting.map((a) => <option key={a.id} value={a.id}>{a.name}{a.handicap ? ` (${a.handicap})` : ""}</option>)}
            </select>
          </div>
          <div><label className={label} htmlFor="fa-par">Partner</label>
            <select id="fa-par" className={field} value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">Pick a player</option>
              {waiting.filter((a) => a.id !== captain).map((a) => <option key={a.id} value={a.id}>{a.name}{a.handicap ? ` (${a.handicap})` : ""}</option>)}
            </select>
          </div>
          <button type="button" disabled={busy || !captain || !partner} onClick={pair} className="btn-primary px-4 py-2">Pair them and email both</button>
        </div>
      )}

      {pairs.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Paired</p>
          {pairs.map((c) => {
            const p = c.paired_with ? byId.get(c.paired_with) : undefined
            return (
              <div key={c.id} className="rounded-xl border border-white/10 p-3 text-sm text-neutral-300">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div><span className="text-xs text-neutral-500">Captain</span><div>{who(c)}</div></div>
                  {p && <div><span className="text-xs text-neutral-500">Partner</span><div>{who(p)}</div></div>}
                </div>
                {c.user_id && onTeam.includes(c.user_id) ? (
                  <p className="mt-2 text-xs text-brand">Team signed up. See the teams table above.</p>
                ) : p && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-amber-300">Waiting for the captain to sign up.</span>
                    <button type="button" className="text-brand underline" onClick={() => navigator.clipboard.writeText(captainSignupUrl(p))}>Copy the captain&apos;s sign-up link</button>
                    <button type="button" className="text-neutral-400 underline" onClick={async () => { await unpairFreeAgentAction(c.id); router.refresh() }}>Undo pairing</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
