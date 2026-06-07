"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface Bay { id: string; number: number; name: string }
interface Booking { id: string; bay_id: string; starts_at: string; ends_at: string; status: string }

const SLOT_MINUTES = 30
const DISPLAY_HOURS = 6 // show next 6 hours

function generateSlots(from: Date): Date[] {
  const slots: Date[] = []
  const start = new Date(from)
  // Round up to nearest 30 min
  const minutes = start.getMinutes()
  const roundedMinutes = Math.ceil(minutes / 30) * 30
  start.setMinutes(roundedMinutes, 0, 0)

  for (let i = 0; i < (DISPLAY_HOURS * 60) / SLOT_MINUTES; i++) {
    slots.push(new Date(start.getTime() + i * SLOT_MINUTES * 60 * 1000))
  }
  return slots
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
}

export default function DisplayBoard({
  bays,
  initialBookings,
}: {
  bays: Bay[]
  initialBookings: Booking[]
}) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings)
  const [now, setNow] = useState(new Date())

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Supabase Realtime: subscribe to booking changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("display-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          // Refetch on any booking change
          const dayEnd = new Date()
          dayEnd.setHours(23, 59, 59, 999)

          supabase
            .from("bookings")
            .select("id, bay_id, starts_at, ends_at, status")
            .in("status", ["confirmed"])
            .gte("ends_at", new Date().toISOString())
            .lte("starts_at", dayEnd.toISOString())
            .order("starts_at")
            .then(({ data }) => {
              if (data) setBookings(data)
            })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const slots = generateSlots(now)

  function isBooked(bayId: string, slot: Date): boolean {
    const slotEnd = new Date(slot.getTime() + SLOT_MINUTES * 60 * 1000)
    return bookings.some(
      (b) =>
        b.bay_id === bayId &&
        new Date(b.starts_at) < slotEnd &&
        new Date(b.ends_at) > slot
    )
  }

  function isCurrentlyActive(bayId: string): boolean {
    return bookings.some(
      (b) =>
        b.bay_id === bayId &&
        new Date(b.starts_at) <= now &&
        new Date(b.ends_at) > now
    )
  }

  function nextAvailableSlot(bayId: string): string {
    for (const slot of slots) {
      if (!isBooked(bayId, slot)) {
        return formatTime(slot)
      }
    }
    return "Check tomorrow"
  }

  const currentTimeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const currentDateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen bg-[#05070c] p-6 font-sans">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Tee365</h1>
          <p className="text-lg text-neutral-400">{currentDateStr}</p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-bold text-white tabular-nums">{currentTimeStr}</p>
          <p className="mt-1 text-sm text-neutral-500">All times local</p>
        </div>
      </div>

      {/* Bay status cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {bays.map((bay) => {
          const active = isCurrentlyActive(bay.id)
          const nextAvail = nextAvailableSlot(bay.id)
          return (
            <div
              key={bay.id}
              className={`rounded-2xl border p-5 transition-all ${
                active
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-green-500/40 bg-green-500/10"
              }`}
            >
              <div className="flex items-start justify-between">
                <h2 className="text-xl font-semibold text-white">{bay.name}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    active ? "bg-red-500/30 text-red-300" : "bg-green-500/30 text-green-300"
                  }`}
                >
                  {active ? "In Use" : "Open"}
                </span>
              </div>
              {!active && (
                <p className="mt-3 text-sm text-neutral-400">
                  Next available: <span className="font-semibold text-white">{nextAvail}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Timeline grid */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Next {DISPLAY_HOURS} hours
        </h2>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Time labels */}
            <div
              className="grid text-xs text-neutral-600 mb-1"
              style={{ gridTemplateColumns: `100px repeat(${slots.length}, 1fr)` }}
            >
              <div />
              {slots.map((slot, i) =>
                i % 2 === 0 ? (
                  <div key={slot.toISOString()} className="text-center">
                    {formatTime(slot)}
                  </div>
                ) : (
                  <div key={slot.toISOString()} />
                )
              )}
            </div>

            {/* Bay rows */}
            {bays.map((bay) => (
              <div
                key={bay.id}
                className="grid items-center mb-2"
                style={{ gridTemplateColumns: `100px repeat(${slots.length}, 1fr)` }}
              >
                <div className="text-sm font-medium text-neutral-300 pr-3">{bay.name}</div>
                {slots.map((slot) => {
                  const booked = isBooked(bay.id, slot)
                  const isPast = slot < now
                  return (
                    <div
                      key={slot.toISOString()}
                      className={`h-10 border-l border-white/5 ${
                        isPast
                          ? "bg-white/5"
                          : booked
                          ? "bg-red-500/30"
                          : "bg-green-500/20"
                      }`}
                    />
                  )
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="mt-4 flex items-center gap-6 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded bg-green-500/20" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded bg-red-500/30" /> Booked
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Book CTA */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-2xl font-semibold text-white">Book your bay online</p>
        <p className="mt-1 text-neutral-400">book.tee365.org</p>
      </div>
    </div>
  )
}
