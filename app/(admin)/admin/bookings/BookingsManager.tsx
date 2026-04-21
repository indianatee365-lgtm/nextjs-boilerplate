"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, X, Lock } from "lucide-react"
import { cancelBooking, blockTime, confirmBookingManually } from "./actions"

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
  bays: { id: string; name: string; number: number } | null
  profiles: { id: string; first_name: string; last_name: string; phone: string | null } | null
}

interface Bay { id: string; number: number; name: string }

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export default function BookingsManager({
  bookings,
  bays,
  selectedDate,
}: {
  bookings: Booking[]
  bays: Bay[]
  selectedDate: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [blocking, setBlocking] = useState(false)
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
    router.push(`/admin/bookings?date=${d.toISOString().split("T")[0]}`)
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

  return (
    <div className="mt-6 space-y-6">
      {/* Date navigation */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigateDate(-1)} className="btn-ghost p-2"><ChevronLeft size={18} /></button>
        <span className="text-lg font-medium text-white">
          {displayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </span>
        <button onClick={() => navigateDate(1)} className="btn-ghost p-2"><ChevronRight size={18} /></button>
        <button onClick={() => setBlocking(true)} className="ml-auto btn-secondary flex items-center gap-2 text-sm">
          <Lock size={14} /> Block Time
        </button>
      </div>

      {/* Bay grid view */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header */}
          <div className="grid text-xs text-neutral-500 mb-1" style={{ gridTemplateColumns: `80px repeat(${bays.length}, 1fr)` }}>
            <div />
            {bays.map((bay) => (
              <div key={bay.id} className="px-2 text-center font-medium text-neutral-300">{bay.name}</div>
            ))}
          </div>

          {/* Hour rows */}
          {HOURS.map((hour) => {
            const hourLabel = hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`
            return (
              <div
                key={hour}
                className="grid border-t border-white/5"
                style={{ gridTemplateColumns: `80px repeat(${bays.length}, 1fr)` }}
              >
                <div className="py-2 pr-3 text-right text-xs text-neutral-600">{hourLabel}</div>
                {bays.map((bay) => {
                  const slotBookings = bookings.filter((b) => {
                    if (b.bays?.id !== bay.id) return false
                    const start = new Date(b.starts_at)
                    const etHour = parseInt(start.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Indiana/Indianapolis" })) % 24
                    return etHour === hour
                  })
                  return (
                    <div key={bay.id} className="min-h-[40px] border-l border-white/5 px-1 py-1">
                      {slotBookings.map((booking) => (
                        <div
                          key={booking.id}
                          className={`rounded px-2 py-1 text-xs ${
                            booking.status === "confirmed"
                              ? "bg-brand/20 text-brand"
                              : booking.status === "cancelled"
                              ? "bg-red-500/20 text-red-400 line-through"
                              : "bg-yellow-500/20 text-yellow-400"
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
                            <button
                              onClick={() => handleCancel(booking.id)}
                              className="mt-0.5 flex items-center gap-0.5 text-red-400 hover:text-red-300"
                            >
                              <X size={10} /> Cancel
                            </button>
                          )}
                          {booking.status === "pending" && (
                            <button
                              onClick={() => handleConfirm(booking.id)}
                              className="mt-0.5 flex items-center gap-0.5 text-green-400 hover:text-green-300"
                            >
                              ✓ Confirm + SMS
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

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

      {isPending && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white">
          Updating…
        </div>
      )}
    </div>
  )
}
