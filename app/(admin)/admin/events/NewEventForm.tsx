"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createEventAction } from "./actions"
import QuotePanel from "./QuotePanel"
import CustomerSearch from "./CustomerSearch"
import DatePickerCalendar from "@/components/admin/DatePickerCalendar"
import { hostAmountFor, hostBlocks } from "@/lib/events/host"

const field = "mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
const label = "block text-xs font-medium text-neutral-400"

export default function NewEventForm({ bays }: { bays: { id: string; name: string }[] }) {
  const router = useRouter()
  const [f, setF] = useState({
    title: "", firstName: "", lastName: "", phone: "", email: "", smsOk: false,
    date: "", startTime: "18:00", hours: "3", bayIds: [] as string[],
    price: "", payment: "deposit" as "deposit" | "full", deposit: "", payBy: "", balanceDue: "", notes: "", sendLink: true,
    host: false, hostRate: "50", hostHours: [] as number[], details: "",
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<{ url: string; id: string } | null>(null)
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await createEventAction({
      title: f.title, firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email, smsOk: f.smsOk,
      date: f.date, startTime: f.startTime, durationMinutes: Math.round(Number(f.hours) * 60), bayIds: f.bayIds,
      bayPrice: Number(f.price), hostRate: Number(f.hostRate), hostHours: f.host ? f.hostHours : [], details: f.details, depositAmount: f.payment === "deposit" ? Number(f.deposit) : null,
      payBy: f.payBy || null, balanceDue: f.payment === "deposit" ? f.balanceDue || null : null, notes: f.notes, sendLink: f.sendLink,
    }).catch((err: unknown) => ({ ok: false as const, error: String(err) }))
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setDone({ url: res.url, id: res.id })
    router.refresh()
  }

  if (done) {
    return (
      <div className="mt-4 rounded-xl border border-brand/40 bg-brand/10 p-4 text-sm">
        <p className="font-semibold text-white">Event created and bays held.{f.sendLink ? " The payment link was sent." : ""}</p>
        <p className="mt-2 text-neutral-300">Payment link (copy it into a text or email if you like):</p>
        <div className="mt-1 flex gap-2">
          <input readOnly value={done.url} className={field} onFocus={(e) => e.target.select()} aria-label="Payment link" />
          <button type="button" className="btn-secondary px-3 text-xs" onClick={() => navigator.clipboard.writeText(done.url)}>Copy</button>
        </div>
        <div className="mt-3 flex gap-4">
          <a href={`/admin/events/${done.id}`} className="text-brand underline">Open the event</a>
          <button type="button" className="text-neutral-400 underline" onClick={() => { setDone(null); setF({ ...f, title: "", firstName: "", lastName: "", phone: "", email: "", price: "", deposit: "", notes: "", bayIds: [] }) }}>New event</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-white/10 p-4">
      <div>
        <label className={label} htmlFor="ev-title">Event name</label>
        <input id="ev-title" className={field} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Smith birthday party" required />
      </div>
      <CustomerSearch onPick={(c) => setF({ ...f, firstName: c.first_name ?? "", lastName: c.last_name ?? "", phone: c.phoneFormatted, email: c.email ?? "", smsOk: c.sms_consent })} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} htmlFor="ev-fn">Customer first name</label><input id="ev-fn" className={field} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-ln">Last name</label><input id="ev-ln" className={field} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-ph">Phone</label><input id="ev-ph" className={field} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-em">Email</label><input id="ev-em" className={field} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={f.smsOk} onChange={(e) => set("smsOk", e.target.checked)} />
        They said texts are OK (payment link, reminders and door code by text)
      </label>

      <div>
        <p className={label}>Pick the date (each day shows what&apos;s already booked)</p>
        <div className="mt-1"><DatePickerCalendar value={f.date} onChange={(d) => set("date", d)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label} htmlFor="ev-date">Date</label><input id="ev-date" type="date" className={field} value={f.date} onChange={(e) => set("date", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-start">Start</label><input id="ev-start" type="time" step={1800} className={field} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-hours">Hours</label>
          <select id="ev-hours" className={field} value={f.hours} onChange={(e) => set("hours", e.target.value)}>
            {Array.from({ length: 23 }, (_, i) => 1 + i * 0.5).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className={label}>Bays</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {bays.map((b) => (
            <label key={b.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${f.bayIds.includes(b.id) ? "border-brand bg-brand/15 text-white" : "border-white/15 text-neutral-400"}`}>
              <input type="checkbox" className="sr-only" checked={f.bayIds.includes(b.id)}
                onChange={() => set("bayIds", f.bayIds.includes(b.id) ? f.bayIds.filter((x) => x !== b.id) : [...f.bayIds, b.id])} />
              {b.name}
            </label>
          ))}
        </div>
      </div>

      <QuotePanel date={f.date} startTime={f.startTime} hours={f.hours} bayCount={f.bayIds.length} onUse={(t) => set("price", String(t))} />
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} htmlFor="ev-price">Agreed price for the bays ($)</label><input id="ev-price" className={field} inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value)} required /></div>
        <div><label className={label} htmlFor="ev-pay">Payment</label>
          <select id="ev-pay" className={field} value={f.payment} onChange={(e) => set("payment", e.target.value)}>
            <option value="deposit">Deposit, then balance</option>
            <option value="full">Paid in full</option>
          </select>
        </div>
        {f.payment === "deposit" && <div><label className={label} htmlFor="ev-dep">Deposit ($)</label><input id="ev-dep" className={field} inputMode="decimal" value={f.deposit} onChange={(e) => set("deposit", e.target.value)} required /></div>}
        <div><label className={label} htmlFor="ev-payby">{f.payment === "deposit" ? "Deposit due by" : "Due by"}</label><input id="ev-payby" type="date" className={field} value={f.payBy} onChange={(e) => set("payBy", e.target.value)} /></div>
        {f.payment === "deposit" && <div><label className={label} htmlFor="ev-bal">Balance due by</label><input id="ev-bal" type="date" className={field} value={f.balanceDue} onChange={(e) => set("balanceDue", e.target.value)} required /></div>}
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={f.host} onChange={(e) => set("host", e.target.checked)} /> Add a host
        </label>
        {f.host && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              Rate $<input inputMode="decimal" value={f.hostRate} onChange={(e) => set("hostRate", e.target.value)} className="w-16 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white" aria-label="Host rate per hour" /> per hour. Tick the hours they want a host:
            </div>
            <div className="flex flex-wrap gap-2">
              {hostBlocks(Math.round(Number(f.hours) * 60)).map((b) => {
                const [h, m] = (f.startTime || "00:00").split(":").map(Number)
                const lbl = (mins: number) => { const t = h * 60 + m + mins; const hh = Math.floor(t / 60) % 24; return `${hh % 12 || 12}${t % 60 ? `:${String(t % 60).padStart(2, "0")}` : ""}${hh < 12 ? "am" : "pm"}` }
                const on = f.hostHours.includes(b.offset)
                return (
                  <label key={b.offset} className={`cursor-pointer rounded-lg border px-2 py-1 text-xs ${on ? "border-brand bg-brand/15 text-white" : "border-white/15 text-neutral-400"}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => set("hostHours", on ? f.hostHours.filter((x) => x !== b.offset) : [...f.hostHours, b.offset])} />
                    {lbl(b.offset)} to {lbl(b.offset + b.minutes)}
                  </label>
                )
              })}
            </div>
          </div>
        )}
        {(() => {
          const bay = Number(f.price) || 0
          const host = f.host ? hostAmountFor(Number(f.hostRate) || 0, f.hostHours, Math.round(Number(f.hours) * 60)) : 0
          return bay > 0 || host > 0 ? (
            <p className="mt-2 text-sm text-neutral-300">Bays ${bay.toFixed(2).replace(/\.00$/, "")}{host ? ` + host $${host.toFixed(2).replace(/\.00$/, "")}` : ""} = <span className="font-semibold text-white">total ${(bay + host).toFixed(2).replace(/\.00$/, "")}</span> <span className="text-xs text-neutral-500">(the deposit comes out of this total)</span></p>
          ) : null
        })()}
      </div>
      <div><label className={label} htmlFor="ev-details">Good to know (the customer sees this; one per line)</label><textarea id="ev-details" rows={3} className={field} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder={"Bring your own food and drinks (no alcohol)\nBalloons and decorations welcome"} /></div>
      <div><label className={label} htmlFor="ev-notes">Notes (only you see these)</label><textarea id="ev-notes" rows={2} className={field} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" checked={f.sendLink} onChange={(e) => set("sendLink", e.target.checked)} />
        Send them the payment link now
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? "Holding the bays..." : "Create event and hold the bays"}</button>
    </form>
  )
}
