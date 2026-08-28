"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"

interface MonthBooking {
  starts_at: string
  status: string
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Same color convention as the day grid: confirmed = brand, pending = yellow,
// cancelled = red. A day with a confirmed booking is green even if it also has
// cancelled ones sitting alongside it, so a cancelled booking never masks real
// activity on the day.
function colorForDay(status: { confirmed: number; pending: number; cancelled: number } | undefined): string {
  if (!status) return "border-white/10 bg-white/5 text-neutral-600"
  if (status.confirmed > 0) return "border-brand/30 bg-brand/20 text-brand"
  if (status.pending > 0) return "border-yellow-500/30 bg-yellow-500/20 text-yellow-400"
  return "border-red-500/30 bg-red-500/20 text-red-400"
}

export default function MonthCalendar({
  bookings,
  selectedDate,
}: {
  bookings: MonthBooking[]
  selectedDate: string
}) {
  const router = useRouter()
  const anchor = new Date(`${selectedDate}T12:00:00`)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()

  const dayStatus = new Map<string, { confirmed: number; pending: number; cancelled: number }>()
  for (const b of bookings) {
    const etDateStr = new Date(b.starts_at).toLocaleDateString("en-CA", {
      timeZone: "America/Indiana/Indianapolis",
    })
    const entry = dayStatus.get(etDateStr) ?? { confirmed: 0, pending: 0, cancelled: 0 }
    if (b.status === "confirmed") entry.confirmed++
    else if (b.status === "pending") entry.pending++
    else if (b.status === "cancelled") entry.cancelled++
    dayStatus.set(etDateStr, entry)
  }

  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`)
  }

  function navigateMonth(offset: number) {
    const d = new Date(year, month + offset, 1)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
    router.push(`/admin/bookings?view=month&date=${ds}`)
  }

  function openDay(dateStr: string) {
    router.push(`/admin/bookings?view=day&date=${dateStr}`)
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" })

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={() => navigateMonth(-1)} className="btn-ghost p-2">
          <ChevronLeft size={18} />
        </button>
        <span className="text-lg font-medium text-white">
          {firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => navigateMonth(1)} className="btn-ghost p-2">
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() => router.push(`/admin/bookings?view=day&date=${selectedDate}`)}
          className="ml-auto btn-secondary flex items-center gap-2 text-sm"
        >
          <CalendarDays size={14} /> Day view
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`empty-${i}`} />
          const dayNum = parseInt(dateStr.split("-")[2], 10)
          const isToday = dateStr === todayStr
          const status = dayStatus.get(dateStr)
          return (
            <button
              key={dateStr}
              onClick={() => openDay(dateStr)}
              className={`aspect-square rounded-lg border p-2 text-left text-sm transition hover:opacity-80 ${colorForDay(status)} ${
                isToday ? "ring-1 ring-white/40" : ""
              }`}
            >
              <div className="font-medium">{dayNum}</div>
              {status && (
                <div className="mt-1 text-[10px] leading-tight opacity-80">
                  {status.confirmed > 0 && <div>{status.confirmed} active</div>}
                  {status.pending > 0 && <div>{status.pending} pending</div>}
                  {status.confirmed === 0 && status.pending === 0 && status.cancelled > 0 && (
                    <div>{status.cancelled} cancelled</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Has active booking</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> Pending only</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Cancelled only</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white/20" /> No bookings</span>
      </div>
    </div>
  )
}
