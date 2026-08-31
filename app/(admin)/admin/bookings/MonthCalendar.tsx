"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"

interface MonthBooking {
  starts_at: string
  status: string
  total: number
  paid_at: string | null
  gift_card_applied: number | null
  refund_amount: number | null
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Bookings-layer color: confirmed = brand, pending = yellow, cancelled = red.
// A day with a confirmed booking is green even if it also has cancelled ones
// sitting alongside it, so a cancelled booking never masks real activity.
function bookingColorForDay(status: { confirmed: number; pending: number; cancelled: number } | undefined): string {
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
  const [showBookings, setShowBookings] = useState(true)
  const [showRevenue, setShowRevenue] = useState(true)
  const anchor = new Date(`${selectedDate}T12:00:00`)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()

  const dayStatus = new Map<string, { confirmed: number; pending: number; cancelled: number; revenue: number }>()
  for (const b of bookings) {
    const etDateStr = new Date(b.starts_at).toLocaleDateString("en-CA", {
      timeZone: "America/Indiana/Indianapolis",
    })
    const entry = dayStatus.get(etDateStr) ?? { confirmed: 0, pending: 0, cancelled: 0, revenue: 0 }
    if (b.status === "confirmed") {
      entry.confirmed++
      // Real cash only - same definition the dashboard's own Sales card
      // already uses (lib/admin/revenue.ts): a real Stripe/free-branch
      // paid_at timestamp is required, and gift-card-covered or refunded
      // portions don't count as cash. Without the paid_at check, leftover
      // manual_test bookings (never actually paid) show up as revenue -
      // confirmed live 2026-08-31, $200 of fake "revenue" on the 26th from
      // exactly that.
      if (b.paid_at) {
        entry.revenue += Number(b.total ?? 0) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0)
      }
    }
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

      {/* Layer toggles - Jerrod's ask 2026-08-31: revenue-on-the-booking-
          calendar felt wrong as a fixed combination, but he wanted both
          available together, not two separate calendars. Both checkable at
          once (default) so it can still look like the old combined view,
          or either can be turned off to declutter. */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBookings}
            onChange={(e) => setShowBookings(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand"
          />
          Bookings
        </label>
        <label className="flex items-center gap-2 text-neutral-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRevenue}
            onChange={(e) => setShowRevenue(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-brand"
          />
          Revenue
        </label>
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
          const isPast = dateStr < todayStr
          const status = dayStatus.get(dateStr)

          // Revenue takes the green whenever it's the layer being shown and
          // the day actually made money - Jerrod's explicit call: a
          // non-zero revenue day should read as green regardless of what
          // booking statuses happen to sit under it. Falls back to the
          // booking-status color only when the bookings layer is on and
          // revenue isn't (or made none that day).
          const hasRevenue = !!status && status.revenue > 0
          const color = isPast
            ? "border-white/5 bg-white/[0.03] text-neutral-500"
            : showRevenue && hasRevenue
              ? "border-brand/30 bg-brand/20 text-brand"
              : showBookings
                ? bookingColorForDay(status)
                : "border-white/10 bg-white/5 text-neutral-600"

          return (
            <button
              key={dateStr}
              onClick={() => openDay(dateStr)}
              className={`aspect-square rounded-lg border p-2 text-left text-sm transition hover:opacity-80 ${color} ${isToday ? "ring-1 ring-white/40" : ""}`}
            >
              <div className={`font-medium ${isPast ? "text-neutral-500" : ""}`}>{dayNum}</div>
              {status && (
                <div className="mt-1 text-[10px] leading-tight opacity-80">
                  {showBookings && status.confirmed > 0 && (
                    <div>{status.confirmed} {isPast ? "completed" : "confirmed"}</div>
                  )}
                  {showBookings && status.pending > 0 && <div>{status.pending} pending</div>}
                  {showBookings && status.confirmed === 0 && status.pending === 0 && status.cancelled > 0 && (
                    <div>{status.cancelled} cancelled</div>
                  )}
                  {showRevenue && hasRevenue && <div>{money(status.revenue)}</div>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> {showRevenue ? "Made revenue, or has a confirmed booking" : "Has a confirmed booking"}</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-yellow-400" /> Pending only</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Cancelled only</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white/20" /> Nothing to show</span>
      </div>
    </div>
  )
}
