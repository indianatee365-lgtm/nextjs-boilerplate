"use client"

import { useState, useEffect, useCallback } from "react"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { loadStripe } from "@stripe/stripe-js"
import { ChevronLeft, ChevronRight, Clock, DollarSign, ChevronDown, ChevronUp, Zap } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

interface Bay { id: string; number: number; name: string }
interface Disclosure { id: string; title: string; body: string }
interface SlotData {
  startsAt: string
  endsAt: string
  label: string
  available: boolean
  pricePerHour: number
  context: { seasonType: string; dayType: string; timeType: string }
}
interface BayAvailability { bay: Bay; slots: SlotData[] }
interface NextAvailable { date: Date; slot: SlotData; bay: Bay }

type Step = "date" | "time" | "review"

export default function BookingFlow({
  bays,
  advanceDays,
  membershipSlug,
  userName,
  disclosures,
}: {
  bays: Bay[]
  advanceDays: number
  membershipSlug: string | null
  userName: string
  disclosures: Disclosure[]
}) {
  const [step, setStep] = useState<Step>("date")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedBay, setSelectedBay] = useState<Bay | null>(null)
  const [selectedStart, setSelectedStart] = useState<SlotData | null>(null)
  const [selectedDuration, setSelectedDuration] = useState(60)
  const [couponCode, setCouponCode] = useState("")
  const [giftCardCode, setGiftCardCode] = useState("")
  const [availability, setAvailability] = useState<BayAvailability[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [bookingError, setBookingError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [acknowledgedDisclosures, setAcknowledgedDisclosures] = useState<Set<string>>(new Set())
  const [expandedDisclosure, setExpandedDisclosure] = useState<string | null>(disclosures[0]?.id ?? null)
  const [nextAvailable, setNextAvailable] = useState<NextAvailable | null | "loading">("loading")
  const allDisclosuresAcknowledged = disclosures.every((d) => acknowledgedDisclosures.has(d.id))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + advanceDays)

  const loadAvailability = useCallback(async (date: Date) => {
    setLoadingSlots(true)
    try {
      const res = await fetch(`/api/availability?date=${date.toISOString()}`)
      const data = await res.json()
      setAvailability(Array.isArray(data) ? data : [])
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  // Fetch next available slot on mount
  useEffect(() => {
    async function findNextAvailable() {
      const now = new Date()
      for (let offset = 0; offset <= Math.min(advanceDays, 7); offset++) {
        const d = new Date(now)
        d.setDate(d.getDate() + offset)
        const res = await fetch(`/api/availability?date=${d.toISOString()}`)
        const data: BayAvailability[] = await res.json()
        if (!Array.isArray(data)) continue
        for (const bayAvail of data) {
          for (let i = 0; i < bayAvail.slots.length - 1; i++) {
            const slot = bayAvail.slots[i]
            const next = bayAvail.slots[i + 1]
            if (slot.available && next.available) {
              const slotDate = new Date(d)
              slotDate.setHours(0, 0, 0, 0)
              setNextAvailable({ date: slotDate, slot, bay: bayAvail.bay })
              return
            }
          }
        }
      }
      setNextAvailable(null)
    }
    findNextAvailable()
  }, [advanceDays])

  useEffect(() => {
    if (selectedDate && step === "time") {
      loadAvailability(selectedDate)
    }
  }, [selectedDate, step, loadAvailability])

  // Merged slots: available if ANY bay has the slot open.
  // Only display slots starting within the selected calendar day — overflow slots
  // past midnight exist in the array solely for consecutive-fit checking.
  function getMergedSlots(): SlotData[] {
    const seen = new Map<string, SlotData>()
    const midnight = selectedDate ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1) : null

    for (const bayAvail of availability) {
      for (const slot of bayAvail.slots) {
        const slotTime = new Date(slot.startsAt)
        if (selectedDate && slotTime < selectedDate) continue
        if (midnight && slotTime >= midnight) continue
        if (!seen.has(slot.startsAt)) {
          seen.set(slot.startsAt, { ...slot, available: false })
        }
        if (slot.available) {
          seen.set(slot.startsAt, { ...slot, available: true })
        }
      }
    }
    return Array.from(seen.values())
  }

  // Check if any single bay can fit the full duration from this slot
  function canFitDurationOnAnyBay(slotStartsAt: string, durationMins: number): boolean {
    const needed = durationMins / 30
    for (const bayAvail of availability) {
      const startIdx = bayAvail.slots.findIndex((s) => s.startsAt === slotStartsAt)
      if (startIdx === -1) continue
      let fits = true
      for (let i = 0; i < needed; i++) {
        if (!bayAvail.slots[startIdx + i]?.available) { fits = false; break }
      }
      if (fits) return true
    }
    return false
  }

  // Find first bay that can fit the full duration from this slot
  function findBayForSlot(slotStartsAt: string, durationMins: number): Bay | null {
    const needed = durationMins / 30
    for (const bayAvail of availability) {
      const startIdx = bayAvail.slots.findIndex((s) => s.startsAt === slotStartsAt)
      if (startIdx === -1) continue
      let fits = true
      for (let i = 0; i < needed; i++) {
        if (!bayAvail.slots[startIdx + i]?.available) { fits = false; break }
      }
      if (fits) return bayAvail.bay
    }
    return null
  }

  function selectDate(date: Date) {
    setSelectedDate(date)
    setSelectedStart(null)
    setSelectedBay(null)
    setStep("time")
  }

  function quickBook(na: NextAvailable) {
    setSelectedDate(na.date)
    setSelectedBay(na.bay)
    setSelectedStart(na.slot)
    setSelectedDuration(60)
    setStep("review")
  }

  // Calendar helpers
  function buildCalendarDays(month: Date): (Date | null)[] {
    const year = month.getFullYear()
    const m = month.getMonth()
    const firstDay = new Date(year, m, 1).getDay()
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(year, m, d))
    }
    return cells
  }

  function isDateSelectable(date: Date | null): boolean {
    if (!date) return false
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d >= today && d <= maxDate
  }

  function formatSlotTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  }

  function formatNextAvailableDate(date: Date): string {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
    if (diff === 0) return "Today"
    if (diff === 1) return "Tomorrow"
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  }

  const pricingPreview = selectedStart
    ? calculateBookingPrice({
        pricePerHour: selectedStart.pricePerHour,
        durationMinutes: selectedDuration,
        context: getPricingContext(new Date(selectedStart.startsAt)),
      })
    : null

  async function handleConfirmBooking() {
    if (!selectedBay || !selectedStart) return
    setSubmitting(true)
    setBookingError("")
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bayId: selectedBay.id,
          startsAt: selectedStart.startsAt,
          durationMinutes: selectedDuration,
          couponCode: couponCode || undefined,
          giftCardCode: giftCardCode || undefined,
          disclosureIds: Array.from(acknowledgedDisclosures),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBookingError(data.error ?? "Something went wrong")
        return
      }
      const stripe = await stripePromise
      if (!stripe) return
      const { error } = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/account/bookings?confirmed=${data.bookingId}`,
        },
      })
      if (error) setBookingError(error.message ?? "Payment failed")
    } finally {
      setSubmitting(false)
    }
  }

  const calendarDays = buildCalendarDays(calendarMonth)
  const mergedSlots = getMergedSlots()

  return (
    <div className="mt-8 space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["date", "time", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-600">›</span>}
            <span className={step === s ? "font-semibold text-brand" : "text-neutral-500 capitalize"}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* ── Next available block ── */}
      {step === "date" && nextAvailable && nextAvailable !== "loading" && (
        <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Zap size={18} className="text-brand shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">
                  Next available: {formatNextAvailableDate(nextAvailable.date)} at {formatSlotTime(nextAvailable.slot.startsAt)}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  ${nextAvailable.slot.pricePerHour}/hr · 1 hr session · click to book instantly
                </p>
              </div>
            </div>
            <button
              onClick={() => quickBook(nextAvailable)}
              className="btn-primary shrink-0 text-sm px-4 py-2"
            >
              Book now
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Date ── */}
      {step === "date" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Select a date</h2>

          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
              className="btn-ghost p-2"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-white">
              {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </span>
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
              className="btn-ghost p-2"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500 mb-1">
            {DAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, i) => {
              const selectable = isDateSelectable(date)
              const isSelected = selectedDate && date &&
                date.toDateString() === selectedDate.toDateString()
              return (
                <button
                  key={i}
                  disabled={!selectable}
                  onClick={() => date && selectDate(date)}
                  className={[
                    "rounded-lg py-2 text-sm transition",
                    !date ? "invisible" : "",
                    selectable
                      ? isSelected
                        ? "bg-brand text-white font-semibold"
                        : "text-white hover:bg-white/10"
                      : "cursor-not-allowed text-neutral-700",
                  ].join(" ")}
                >
                  {date?.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Time + duration ── */}
      {step === "time" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("date")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          <div className="mb-5 mt-4">
            <p className="mb-2 text-sm text-neutral-400">Session length</p>
            <div className="flex flex-wrap gap-2">
              {[60, 90, 120, 150, 180, 210, 240].map((mins) => (
                <button
                  key={mins}
                  onClick={() => { setSelectedDuration(mins); setSelectedStart(null); setSelectedBay(null) }}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm transition",
                    selectedDuration === mins
                      ? "border-brand bg-brand/20 text-brand"
                      : "border-white/10 text-neutral-300 hover:border-white/30",
                  ].join(" ")}
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}hr${mins > 60 ? "s" : ""}`}
                </button>
              ))}
            </div>
          </div>

          {loadingSlots ? (
            <p className="text-sm text-neutral-400">Loading slots…</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-400">Select start time</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {mergedSlots.map((slot) => {
                  const canFit = canFitDurationOnAnyBay(slot.startsAt, selectedDuration)
                  const isSelected = selectedStart?.startsAt === slot.startsAt
                  return (
                    <button
                      key={slot.startsAt}
                      disabled={!slot.available || !canFit}
                      onClick={() => {
                        const bay = findBayForSlot(slot.startsAt, selectedDuration)
                        setSelectedStart(slot)
                        setSelectedBay(bay)
                      }}
                      className={[
                        "rounded-lg border py-2 text-xs transition",
                        slot.available && canFit
                          ? isSelected
                            ? "border-brand bg-brand/20 text-brand font-semibold"
                            : "border-white/10 text-white hover:border-white/30"
                          : "cursor-not-allowed border-white/5 text-neutral-700",
                      ].join(" ")}
                    >
                      {formatSlotTime(slot.startsAt)}
                    </button>
                  )
                })}
              </div>

              {selectedStart && pricingPreview && (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-neutral-300">
                      <Clock size={14} /> {selectedDuration / 60}hr session starting {formatSlotTime(selectedStart.startsAt)}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-white">
                      <DollarSign size={14} />{pricingPreview.subtotal.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    ${selectedStart.pricePerHour}/hr ·{" "}
                    {selectedStart.context.seasonType === "on" ? "On-season" : "Off-season"} ·{" "}
                    {selectedStart.context.dayType === "weekend" ? "Weekend" : "Weekday"} ·{" "}
                    {selectedStart.context.timeType === "premium" ? "Premium hours" : "Off-peak hours"}
                  </p>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  disabled={!selectedStart}
                  onClick={() => setStep("review")}
                  className="btn-primary"
                >
                  Review booking
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Review + discounts ── */}
      {step === "review" && selectedStart && selectedBay && pricingPreview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("time")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
          <h2 className="mb-5 text-lg font-semibold text-white">Review your booking</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-neutral-300">
              <span>Date</span>
              <span>{selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Start time</span>
              <span>{new Date(selectedStart.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Duration</span>
              <span>{selectedDuration / 60} hour{selectedDuration > 60 ? "s" : ""}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 text-neutral-300">
              <span>Subtotal</span>
              <span>${pricingPreview.subtotal.toFixed(2)}</span>
            </div>
            {pricingPreview.membershipDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Member discount</span>
                <span>−${pricingPreview.membershipDiscount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="mt-5">
            <label className="label" htmlFor="couponCode">Coupon code</label>
            <input
              id="couponCode"
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="input mt-1"
            />
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="giftCardCode">Gift card</label>
            <input
              id="giftCardCode"
              type="text"
              value={giftCardCode}
              onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="input mt-1"
            />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="font-semibold text-white">Total due</span>
            <span className="text-xl font-bold text-white">${pricingPreview.total.toFixed(2)}</span>
          </div>

          {disclosures.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium text-white">
                Please read and acknowledge the following before booking:
              </p>
              {disclosures.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedDisclosure(expandedDisclosure === d.id ? null : d.id)}
                  >
                    <span className="text-sm font-medium text-white">{d.title}</span>
                    {expandedDisclosure === d.id
                      ? <ChevronUp size={16} className="text-neutral-400 shrink-0" />
                      : <ChevronDown size={16} className="text-neutral-400 shrink-0" />}
                  </button>
                  {expandedDisclosure === d.id && (
                    <div className="border-t border-white/10 px-4 py-3">
                      <div className="max-h-48 overflow-y-auto text-xs leading-5 text-neutral-300 whitespace-pre-wrap">
                        {d.body}
                      </div>
                    </div>
                  )}
                  <div className="border-t border-white/10 px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={acknowledgedDisclosures.has(d.id)}
                        onChange={() => setAcknowledgedDisclosures((prev) => {
                          const next = new Set(prev)
                          next.has(d.id) ? next.delete(d.id) : next.add(d.id)
                          return next
                        })}
                        className="h-4 w-4 rounded border-white/20 bg-white/10 accent-brand"
                      />
                      I have read and agree to the {d.title}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bookingError && (
            <p className="mt-3 text-sm text-red-400">{bookingError}</p>
          )}

          <button
            onClick={handleConfirmBooking}
            disabled={submitting || !allDisclosuresAcknowledged}
            className="btn-primary mt-5 w-full"
          >
            {submitting ? "Processing…" : `Pay $${pricingPreview.total.toFixed(2)} and confirm`}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-500">
            Payment processed securely by Stripe
          </p>
        </div>
      )}
    </div>
  )
}
