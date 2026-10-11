"use client"

import { useEffect, useState } from "react"
import { dayDetailAction, monthOverviewAction } from "@/app/(admin)/admin/calendar-actions"
import type { DayItem, DaySummary } from "@/lib/admin/calendar"

const TZ = "America/Indiana/Indianapolis"
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const monthLabel = (m: string) => new Date(m + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
const shift = (m: string, by: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return d.toISOString().slice(0, 7) }

const KIND: Record<DayItem["kind"], string> = { booking: "text-neutral-300", event: "text-sky-300", party: "text-[#00A651]", block: "text-amber-300" }

/**
 * Month calendar for picking an event or party date. Each day shows what is
 * already on it; picking a day lists that day's bookings, events, parties and
 * blocked time so conflicts are visible before saving.
 */
export default function DatePickerCalendar({ value, onChange }: { value: string; onChange: (dateKey: string) => void }) {
  const today = todayKey()
  const [month, setMonth] = useState((value || today).slice(0, 7))
  const [days, setDays] = useState<Record<string, DaySummary>>({})
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<DayItem[] | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    monthOverviewAction(month).then((d) => { if (live) setDays(d) }).catch(() => { if (live) setDays({}) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [month])

  useEffect(() => {
    let live = true
    if (!value) { setDetail(null); return }
    dayDetailAction(value).then((d) => { if (live) setDetail(d) }).catch(() => { if (live) setDetail(null) })
    return () => { live = false }
  }, [value])

  const [y, m] = month.split("-").map(Number)
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)]

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between">
        <button type="button" className="rounded px-2 py-1 text-sm text-neutral-300 hover:bg-white/10 disabled:opacity-30" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">&larr;</button>
        <p className="text-sm font-semibold text-white">{monthLabel(month)}{loading ? <span className="ml-2 text-xs font-normal text-neutral-500">loading</span> : null}</p>
        <button type="button" className="rounded px-2 py-1 text-sm text-neutral-300 hover:bg-white/10" onClick={() => setMonth(shift(month, 1))} aria-label="Next month">&rarr;</button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-neutral-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((k, i) => {
          if (!k) return <div key={`x${i}`} />
          const s = days[k]
          const past = k < today
          const selected = k === value
          return (
            <button key={k} type="button" disabled={past} onClick={() => onChange(k)}
              title={s ? [...s.parties.map((t) => `Party: ${t}`), ...s.events.map((t) => `Event: ${t}`), ...s.blocks, s.bookings ? `${s.bookings} booking${s.bookings > 1 ? "s" : ""}` : ""].filter(Boolean).join("\n") : ""}
              className={`flex min-h-14 flex-col items-start rounded-lg border p-1 text-left text-xs disabled:opacity-30 ${selected ? "border-[#00A651] bg-[#00A651]/20" : "border-white/10 hover:bg-white/5"}`}>
              <span className={`font-semibold ${k === today ? "text-[#00A651]" : "text-white"}`}>{Number(k.slice(8))}</span>
              {s?.parties.length ? <span className="w-full truncate text-[10px] text-[#00A651]">Party</span> : null}
              {s?.events.length ? <span className="w-full truncate text-[10px] text-sky-300">Event</span> : null}
              {s?.blocks.length ? <span className="w-full truncate text-[10px] text-amber-300">{s.blocks[0].replace("Thursday Night League", "League")}</span> : null}
              {s?.bookings ? <span className="text-[10px] text-neutral-400">{s.bookings} bkg</span> : null}
            </button>
          )
        })}
      </div>
      {value && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold text-neutral-300">
            {new Date(value + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
          {detail === null ? <p className="mt-1 text-xs text-neutral-500">Loading...</p>
            : detail.length === 0 ? <p className="mt-1 text-xs text-neutral-400">Nothing booked. Every bay is free all day.</p>
            : (
              <ul className="mt-1 space-y-1">
                {detail.map((d, i) => (
                  <li key={i} className={`text-xs ${KIND[d.kind]}`}>{d.start} to {d.end} &middot; {d.bays} &middot; {d.label}</li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}
