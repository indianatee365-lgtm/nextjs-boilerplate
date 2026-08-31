"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, X, Lock, CalendarRange } from "lucide-react"
import { cancelBooking, blockTime, confirmBookingManually, rescheduleBooking } from "./actions"

interface Booking {
  id: string
  starts_at: string
  ends_at: string
  status: string
  total: number
  duration_minutes: number
  access_code: string | null
  notes: string | null
  cancelled_at: string | null
  refund_amount: number | null
  created_at?: string
  stripe_payment_intent_id?: string | null
  subtotal?: number
  membership_discount?: number
  coupon_discount?: number
  tax?: number
  gift_card_applied?: number
  credit_hours_applied?: number
  credit_discount?: number
  paid_at?: string | null
  bays: { id: string; name: string; number: number } | null
  profiles: { id: string; first_name: string; last_name: string; phone: string | null } | null
}

interface Bay { id: string; number: number; name: string }

// Half-hour resolution, not hourly - BookingFlow.tsx snaps every booking to
// a :00/:30 boundary (confirmed 2026-08-29), so an hour-only grid renders a
// 10:30 booking as if it started at 10:00, which is exactly what makes an
// admin misjudge whether there's room to extend an adjacent booking.
const SLOTS = Array.from({ length: 48 }, (_, i) => i)

function slotToHourMinute(slot: number): { hour: number; minute: number } {
  return { hour: Math.floor(slot / 2), minute: (slot % 2) * 30 }
}

function slotLabel(slot: number): string {
  const { hour, minute } = slotToHourMinute(slot)
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const ampm = hour < 12 ? "am" : "pm"
  return minute === 0 ? `${h12}${ampm}` : `${h12}:${minute}${ampm}`
}

// Grid row for a given half-hour slot - +2 to leave row 1 for the bay-name
// header (rows are 1-indexed in CSS Grid).
function slotRow(slot: number): number {
  return slot + 2
}

// roundUp=false for a booking's start (floor to the slot it's actually in),
// roundUp=true for its end (a booking ending mid-slot still visually blocks
// the full slot it ends in, rounding up rather than under-representing how
// long the bay is occupied).
function etSlot(date: Date, roundUp: boolean): number {
  const str = date.toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: false,
    timeZone: "America/Indiana/Indianapolis",
  })
  const [h, m] = str.split(":").map((s) => parseInt(s, 10))
  const totalMinutes = (h % 24) * 60 + m
  const raw = totalMinutes / 30
  return roundUp ? Math.ceil(raw) : Math.floor(raw)
}

function bookingSlotSpan(startsAt: string, endsAt: string): { start: number; end: number } {
  const start = etSlot(new Date(startsAt), false)
  let end = etSlot(new Date(endsAt), true)
  if (end <= start) end = start + 1
  return { start, end }
}

function money(n: number | null | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`
}

function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
  })
}

function getAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function BookingsManager({
  bookings,
  bays,
  selectedDate,
  pendingMode = false,
}: {
  bookings: Booking[]
  bays: Bay[]
  selectedDate: string
  pendingMode?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [blocking, setBlocking] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"active" | "pending" | "cancelled" | "all">("active")
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null)
  const [justDragged, setJustDragged] = useState(false)
  const [blockForm, setBlockForm] = useState({
    bayId: "" as string | null,
    date: selectedDate,
    startTime: "09:00",
    endTime: "10:00",
    reason: "",
  })

  function navigateDate(offset: number) {
    const d = new Date(`${selectedDate}T00:00:00`)
    d.setDate(d.getDate() + offset)
    // This component only ever renders in day view (month view renders
    // MonthCalendar instead) - dropping view=day here fell back to
    // page.tsx's default (month), so Next/Prev silently bounced out of
    // day view instead of moving a day.
    router.push(`/admin/bookings?view=day&date=${d.toISOString().split("T")[0]}`)
  }

  function handleCancel(bookingId: string) {
    if (!confirm("Cancel this booking? A refund will be issued to the customer.")) return
    startTransition(async () => {
      await cancelBooking(bookingId)
      router.refresh()
    })
  }

  function handleConfirm(bookingId: string) {
    if (!confirm("Manually confirm this booking and send SMS to customer?")) return
    startTransition(async () => {
      await confirmBookingManually(bookingId)
      router.refresh()
    })
  }

  function handleDragStart(e: React.DragEvent, bookingId: string) {
    e.dataTransfer.setData("text/plain", bookingId)
    e.dataTransfer.effectAllowed = "move"
    setJustDragged(true)
  }

  // Chrome doesn't fire a click after a real drag, but this guards the other
  // browsers/edge cases that do - a card drop shouldn't also pop the detail
  // panel open on top of the "move this booking?" confirm dialog.
  function handleDragEnd() {
    setTimeout(() => setJustDragged(false), 0)
  }

  function handleDrop(e: React.DragEvent, bay: Bay, slot: number) {
    e.preventDefault()
    setDragOverKey(null)
    const bookingId = e.dataTransfer.getData("text/plain")
    if (!bookingId) return
    if (!confirm(`Move this booking to ${bay.name} at ${slotLabel(slot)}? Price stays the same and the customer will be texted/emailed the new time.`)) return

    // Same-day-only by design - the grid only ever shows one date, so this
    // is the only time this action can construct. Server recomputes the
    // duration from the booking's own duration_minutes rather than trusting
    // a client-sent end time.
    const { hour, minute } = slotToHourMinute(slot)
    const startsAt = new Date(`${selectedDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`)

    startTransition(async () => {
      try {
        await rescheduleBooking(bookingId, bay.id, startsAt.toISOString())
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not move that booking.")
      }
    })
  }

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault()
    const startsAt = new Date(`${blockForm.date}T${blockForm.startTime}:00`)
    const endsAt = new Date(`${blockForm.date}T${blockForm.endTime}:00`)
    await blockTime({
      bayId: blockForm.bayId || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      reason: blockForm.reason,
    })
    setBlocking(false)
    router.refresh()
  }

  const displayDate = new Date(`${selectedDate}T12:00:00`)

  // Current-time indicator: only meaningful on the day actually showing
  // "now" - a past or future date has no real "now" row to draw. Positioned
  // as a fractional offset within its half-hour slot's own row rather than
  // computed against real pixel heights, since row heights vary with
  // content (minmax(20px, auto)) - close enough for an at-a-glance line,
  // not meant to be pixel-exact.
  const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" })
  const isToday = selectedDate === todayET
  const nowET = new Date().toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false,
    timeZone: "America/Indiana/Indianapolis",
  })
  const [nowH, nowM, nowS] = nowET.split(":").map((s) => parseInt(s, 10))
  const nowTotalMinutes = (nowH % 24) * 60 + nowM + nowS / 60
  const nowSlot = Math.floor(nowTotalMinutes / 30)
  const nowFraction = (nowTotalMinutes % 30) / 30
  const nowMs = new Date().getTime()

  const statusCounts = useMemo(() => ({
    active: bookings.filter((b) => b.status === "confirmed").length,
    pending: bookings.filter((b) => b.status === "pending").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    all: bookings.length,
  }), [bookings])

  const visibleBookings = useMemo(() => {
    if (statusFilter === "all") return bookings
    if (statusFilter === "active") return bookings.filter((b) => b.status === "confirmed")
    return bookings.filter((b) => b.status === statusFilter)
  }, [bookings, statusFilter])

  return (
    <div className="mt-6 space-y-6">
      {/* Pending payments view */}
      {pendingMode && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => router.push("/admin/bookings")}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
            >
              <ChevronLeft size={14} /> Back to calendar
            </button>
            <span className="text-sm text-neutral-500">{bookings.length} pending payment{bookings.length !== 1 ? "s" : ""}</span>
          </div>
          {bookings.length === 0 ? (
            <p className="text-sm text-neutral-500">No pending payments.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Bay</th>
                    <th className="px-4 py-3">Booking time</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Stripe PI</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">
                        {b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "N/A"}
                      </td>
                      <td className="px-4 py-3">{b.bays?.name ?? "N/A"}</td>
                      <td className="px-4 py-3">
                        {new Date(b.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Indiana/Indianapolis" })}{" "}
                        {new Date(b.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      </td>
                      <td className="px-4 py-3">${Number(b.total).toFixed(2)}</td>
                      <td className="px-4 py-3 text-neutral-500">{b.created_at ? getAge(b.created_at) : "N/A"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-600">{b.stripe_payment_intent_id ?? "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Date navigation + grid (hidden in pending mode) */}
      {!pendingMode && (
      <>
      <div className="flex items-center gap-4">
        <button onClick={() => navigateDate(-1)} className="btn-ghost p-2"><ChevronLeft size={18} /></button>
        <span className="text-lg font-medium text-white">
          {displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </span>
        <button onClick={() => navigateDate(1)} className="btn-ghost p-2"><ChevronRight size={18} /></button>
        <button
          onClick={() => router.push(`/admin/bookings?view=month&date=${selectedDate}`)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <CalendarRange size={14} /> Month view
        </button>
        <button onClick={() => setBlocking(true)} className="ml-auto btn-secondary flex items-center gap-2 text-sm">
          <Lock size={14} /> Block Time
        </button>
      </div>

      {/* Status filter tabs - opens on Active so a day full of cancelled bookings doesn't bury it */}
      <div className="flex items-center gap-2">
        {(["active", "pending", "cancelled", "all"] as const).map((s) => {
          const activeClasses =
            s === "active" ? "bg-brand/20 text-brand"
            : s === "pending" ? "bg-yellow-500/20 text-yellow-400"
            : s === "cancelled" ? "bg-red-500/20 text-red-400"
            : "bg-white/15 text-white"
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                statusFilter === s ? activeClasses : "bg-white/5 text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {s} ({statusCounts[s]})
            </button>
          )
        })}
      </div>

      {/* Bay grid view - one unified grid (not 24 stacked per-hour grids) at
          half-hour resolution, so a booking's card spans its actual duration
          and lands on the real :00/:30 boundary it starts on, instead of only
          ever appearing in - and snapping to - its start hour's cell. */}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[700px]"
          style={{
            gridTemplateColumns: `80px repeat(${bays.length}, 1fr)`,
            gridTemplateRows: `auto repeat(48, minmax(20px, auto))`,
          }}
        >
          {/* Header row */}
          <div style={{ gridColumn: 1, gridRow: 1 }} />
          {bays.map((bay, bi) => (
            <div
              key={bay.id}
              style={{ gridColumn: bi + 2, gridRow: 1 }}
              className="px-2 pb-1 text-center text-xs font-medium text-neutral-300"
            >
              {bay.name}
            </div>
          ))}

          {/* Half-hour labels - only the on-the-hour slots get text, to avoid
              a cluttered every-30-min label column, but every slot still gets
              its own row so bookings can land precisely. */}
          {SLOTS.map((slot) => {
            const onHour = slot % 2 === 0
            return (
              <div
                key={`label-${slot}`}
                style={{ gridColumn: 1, gridRow: slotRow(slot) }}
                className={`py-1 pr-3 text-right text-[10px] text-neutral-600 ${onHour ? "border-t border-white/5" : ""}`}
              >
                {onHour ? slotLabel(slot) : ""}
              </div>
            )
          })}

          {/* Drop-target background cells - one per bay/half-hour regardless
              of whether a booking currently occupies it, so there's always
              somewhere to drop onto (including slots "covered" only by
              another booking's span, which sit visually beneath that card). */}
          {bays.map((bay, bi) =>
            SLOTS.map((slot) => {
              const cellKey = `${bay.id}-${slot}`
              const onHour = slot % 2 === 0
              return (
                <div
                  key={cellKey}
                  style={{ gridColumn: bi + 2, gridRow: slotRow(slot) }}
                  className={`border-l border-t transition-colors ${onHour ? "border-white/5" : "border-white/[0.03]"} ${
                    dragOverKey === cellKey ? "bg-brand/10 ring-1 ring-inset ring-brand/40" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                    if (dragOverKey !== cellKey) setDragOverKey(cellKey)
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === cellKey ? null : k))}
                  onDrop={(e) => handleDrop(e, bay, slot)}
                />
              )
            })
          )}

          {/* Current-time line - only on today's grid, see isToday/nowSlot
              above. pointer-events-none so it never intercepts drag/drop or
              clicks meant for the cells and cards underneath it. */}
          {isToday && nowSlot >= 0 && nowSlot < SLOTS.length && (
            <div
              style={{ gridColumn: "1 / -1", gridRow: slotRow(nowSlot) }}
              className="pointer-events-none relative z-10"
            >
              <div
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${nowFraction * 100}%` }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span className="h-px flex-1 bg-red-500/70" />
              </div>
            </div>
          )}

          {/* Booking cards - spans start-slot to end-slot so the card visually
              blocks out the whole session at its real :00/:30 position, not
              just the hour it started in. */}
          {bays.map((bay, bi) =>
            visibleBookings
              .filter((booking) => booking.bays?.id === bay.id)
              .map((booking) => {
                const { start, end } = bookingSlotSpan(booking.starts_at, booking.ends_at)
                // A finished session is a good outcome, not a faded one -
                // Jerrod's call 2026-08-31: gray read as "less important,"
                // completed should read as positive (green), same family as
                // the confirm/completed checkmarks elsewhere on this page.
                const isCompleted = booking.status === "confirmed" && new Date(booking.ends_at).getTime() < nowMs
                return (
                  <div
                    key={booking.id}
                    style={{ gridColumn: bi + 2, gridRow: `${slotRow(start)} / ${slotRow(end)}` }}
                    draggable={booking.status !== "cancelled" && !isCompleted}
                    onDragStart={(e) => handleDragStart(e, booking.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => { if (!justDragged) setDetailBooking(booking) }}
                    className={`m-1 overflow-hidden rounded border px-2 py-1 text-xs shadow-sm ${booking.status !== "cancelled" && !isCompleted ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
                      isCompleted
                        ? "border-green-500/50 bg-green-500/15 text-green-400"
                        : booking.status === "confirmed"
                        ? "border-brand/50 bg-brand/20 text-brand"
                        : booking.status === "cancelled"
                        ? "border-red-500/50 bg-red-500/20 text-red-400 line-through"
                        : "border-yellow-500/50 bg-yellow-500/20 text-yellow-400"
                    }`}
                  >
                    <div className="font-medium">
                      {booking.profiles?.first_name} {booking.profiles?.last_name?.[0]}.
                    </div>
                    <div className="opacity-75">
                      {new Date(booking.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      {" – "}
                      {new Date(booking.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                    </div>
                    {booking.status === "confirmed" && (
                      isCompleted ? (
                        <span className="mt-0.5 flex items-center gap-0.5 text-green-400">
                          ✓ Completed
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancel(booking.id) }}
                          className="mt-0.5 flex items-center gap-0.5 text-red-400 hover:text-red-300"
                        >
                          <X size={10} /> Cancel
                        </button>
                      )
                    )}
                    {booking.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConfirm(booking.id) }}
                        className="mt-0.5 flex items-center gap-0.5 text-green-400 hover:text-green-300"
                      >
                        ✓ Confirm + SMS
                      </button>
                    )}
                  </div>
                )
              })
          )}
        </div>
      </div>
      </>
      )}
      {/* Block time modal */}
      {blocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Block Time</h2>
              <button onClick={() => setBlocking(false)} className="text-neutral-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleBlock} className="space-y-4">
              <div>
                <label className="label">Bay (leave blank for all bays)</label>
                <select
                  className="input"
                  value={blockForm.bayId ?? ""}
                  onChange={(e) => setBlockForm((f) => ({ ...f, bayId: e.target.value || null }))}
                >
                  <option value="">All bays</option>
                  {bays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={blockForm.date}
                  onChange={(e) => setBlockForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start time</label>
                  <input
                    type="time"
                    className="input"
                    value={blockForm.startTime}
                    onChange={(e) => setBlockForm((f) => ({ ...f, startTime: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="label">End time</label>
                  <input
                    type="time"
                    className="input"
                    value={blockForm.endTime}
                    onChange={(e) => setBlockForm((f) => ({ ...f, endTime: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">Reason (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Maintenance"
                />
              </div>
              <button type="submit" className="btn-primary w-full">Block time</button>
            </form>
          </div>
        </div>
      )}

      {/* Booking detail panel */}
      {detailBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setDetailBooking(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {detailBooking.profiles
                    ? `${detailBooking.profiles.first_name} ${detailBooking.profiles.last_name}`
                    : "Unknown customer"}
                </h2>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  detailBooking.status === "confirmed" ? "bg-brand/20 text-brand"
                  : detailBooking.status === "cancelled" ? "bg-red-500/20 text-red-400"
                  : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {detailBooking.status}
                </span>
              </div>
              <button onClick={() => setDetailBooking(null)} className="text-neutral-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Bay</span>
                <span className="text-white">{detailBooking.bays?.name ?? "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Booked for</span>
                <span className="text-white">{fullDateTime(detailBooking.starts_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Ends</span>
                <span className="text-white">{fullDateTime(detailBooking.ends_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Duration</span>
                <span className="text-white">{detailBooking.duration_minutes} min</span>
              </div>
              {detailBooking.profiles?.phone && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Phone</span>
                  <span className="text-white">{detailBooking.profiles.phone}</span>
                </div>
              )}

              <div className="my-2 border-t border-white/10" />

              <div className="flex justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span className="text-white">{money(detailBooking.subtotal)}</span>
              </div>
              {!!detailBooking.membership_discount && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Membership discount</span>
                  <span className="text-red-400">-{money(detailBooking.membership_discount)}</span>
                </div>
              )}
              {!!detailBooking.coupon_discount && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Coupon discount</span>
                  <span className="text-red-400">-{money(detailBooking.coupon_discount)}</span>
                </div>
              )}
              {!!detailBooking.credit_discount && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Hour credit ({detailBooking.credit_hours_applied}h)</span>
                  <span className="text-red-400">-{money(detailBooking.credit_discount)}</span>
                </div>
              )}
              {!!detailBooking.gift_card_applied && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Gift card applied</span>
                  <span className="text-red-400">-{money(detailBooking.gift_card_applied)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-500">Tax</span>
                <span className="text-white">{money(detailBooking.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span className="text-white">{detailBooking.status === "cancelled" ? "Total" : "Paid"}</span>
                <span className="text-white">{money(detailBooking.total)}</span>
              </div>

              <div className="my-2 border-t border-white/10" />

              <div className="flex justify-between">
                <span className="text-neutral-500">Payment</span>
                <span className="font-mono text-xs text-neutral-400">
                  {detailBooking.stripe_payment_intent_id ?? "No charge (free/comp)"}
                </span>
              </div>
              {detailBooking.paid_at && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Paid at</span>
                  <span className="text-white">{fullDateTime(detailBooking.paid_at)}</span>
                </div>
              )}
              {detailBooking.access_code && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Access code</span>
                  <span className="font-mono text-white">{detailBooking.access_code}</span>
                </div>
              )}
              {detailBooking.created_at && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Booked</span>
                  <span className="text-white">{getAge(detailBooking.created_at)}</span>
                </div>
              )}
              {detailBooking.status === "cancelled" && (
                <>
                  {detailBooking.cancelled_at && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Cancelled</span>
                      <span className="text-white">{fullDateTime(detailBooking.cancelled_at)}</span>
                    </div>
                  )}
                  {detailBooking.refund_amount != null && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Refunded</span>
                      <span className="text-white">{money(detailBooking.refund_amount)}</span>
                    </div>
                  )}
                </>
              )}
              {detailBooking.notes && (
                <div>
                  <span className="text-neutral-500">Notes</span>
                  <p className="mt-1 rounded-lg bg-white/5 p-2 text-neutral-300">{detailBooking.notes}</p>
                </div>
              )}
            </div>

            {detailBooking.status === "confirmed" && (
              <button
                onClick={() => { handleCancel(detailBooking.id); setDetailBooking(null) }}
                className="mt-5 w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
              >
                Cancel this booking
              </button>
            )}
            {detailBooking.status === "pending" && (
              <button
                onClick={() => { handleConfirm(detailBooking.id); setDetailBooking(null) }}
                className="mt-5 w-full rounded-lg border border-green-500/30 bg-green-500/10 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
              >
                Confirm + send SMS
              </button>
            )}
          </div>
        </div>
      )}

      {isPending && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white">
          Updating…
        </div>
      )}
    </div>
  )
}
