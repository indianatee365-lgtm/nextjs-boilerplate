"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createPartyAction } from "./actions"
import DatePickerCalendar from "@/components/admin/DatePickerCalendar"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
const label = "block text-xs font-medium text-neutral-400"

export default function NewPartyForm({ bays }: { bays: { id: string; name: string }[] }) {
  const router = useRouter()
  const [f, setF] = useState({
    title: "", description: "", details: "", date: "", startTime: "15:00", endTime: "19:00",
    ticketPrice: "", capacity: "49", maxPerOrder: "5", salesClose: "0",
    bayIds: bays.map((b) => b.id), activities: Object.fromEntries(bays.map((b) => [b.name, ""])) as Record<string, string>,
    published: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await createPartyAction({
      title: f.title, description: f.description, details: f.details, date: f.date, startTime: f.startTime, endTime: f.endTime,
      ticketPrice: Number(f.ticketPrice), capacity: Number(f.capacity), maxPerOrder: Number(f.maxPerOrder),
      salesCloseMinutesBefore: Number(f.salesClose), bayIds: f.bayIds,
      activities: bays.filter((b) => f.bayIds.includes(b.id)).map((b) => ({ bay: b.name, label: f.activities[b.name] ?? "" })),
      published: f.published,
    }).catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    router.push(`/admin/tickets/${res.id}`)
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-white/10 p-4">
      <div><label className={label} htmlFor="p-title">Name</label><input id="p-title" className={field} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Notre Dame vs. BYU Watch Party" required /></div>
      <div><label className={label} htmlFor="p-desc">Description (shows on the ticket page)</label><textarea id="p-desc" rows={3} className={field} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="The game on the big screens, a hole-in-one contest, closest to the pin, prizes..." /></div>
      <div><label className={label} htmlFor="p-details">Good to know (one per line)</label><textarea id="p-details" rows={4} className={field} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder={"Food and drinks provided\nBring a bag chair\nDoors open 30 minutes early"} /></div>
      <div>
        <p className={label}>Pick the date (each day shows what&apos;s already booked)</p>
        <div className="mt-1"><DatePickerCalendar value={f.date} onChange={(d) => set("date", d)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label} htmlFor="p-date">Date</label><input id="p-date" type="date" className={field} value={f.date} onChange={(e) => set("date", e.target.value)} required /></div>
        <div><label className={label} htmlFor="p-start">Start</label><input id="p-start" type="time" className={field} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} required /></div>
        <div><label className={label} htmlFor="p-end">End</label><input id="p-end" type="time" className={field} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label} htmlFor="p-price">Ticket price ($)</label><input id="p-price" inputMode="decimal" className={field} value={f.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} required /></div>
        <div><label className={label} htmlFor="p-cap">Capacity</label><input id="p-cap" inputMode="numeric" className={field} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} required /></div>
        <div><label className={label} htmlFor="p-max">Max per order</label><input id="p-max" inputMode="numeric" className={field} value={f.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} required /></div>
      </div>
      <div>
        <label className={label} htmlFor="p-close">Ticket sales close</label>
        <select id="p-close" className={field} value={f.salesClose} onChange={(e) => set("salesClose", e.target.value)}>
          <option value="0">At the start time</option>
          <option value="60">1 hour before</option>
          <option value="180">3 hours before</option>
          <option value="1440">The day before</option>
        </select>
      </div>
      <div>
        <p className={label}>Bays (held from regular bookings from 30 minutes before the start) and what&apos;s on each</p>
        <div className="mt-1 space-y-2">
          {bays.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <label className="flex w-24 items-center gap-2 text-sm text-neutral-200">
                <input type="checkbox" checked={f.bayIds.includes(b.id)} onChange={() => set("bayIds", f.bayIds.includes(b.id) ? f.bayIds.filter((x) => x !== b.id) : [...f.bayIds, b.id])} />
                {b.name}
              </label>
              <input className={`${field} mt-0`} disabled={!f.bayIds.includes(b.id)} value={f.activities[b.name] ?? ""} aria-label={`What's on ${b.name}`}
                onChange={(e) => set("activities", { ...f.activities, [b.name]: e.target.value })} placeholder="e.g. The game / Hole-in-one contest / Closest to the pin" />
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={f.published} onChange={(e) => set("published", e.target.checked)} />
        Put it on sale now (otherwise it saves as a hidden draft)
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? "Saving..." : "Create party"}</button>
    </form>
  )
}
