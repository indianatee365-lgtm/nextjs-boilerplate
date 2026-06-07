"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ChevronLeft, ChevronRight, Clock, DollarSign, ChevronDown, ChevronUp, Zap, Timer } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const EXPIRY_SECONDS = 900

interface Bay { id: string; number: number; name: string }
interface SlotData {
  startsAt: string
  endsAt: string
  label: string
  available: boolean
  pricePerHour: number
  context: { seasonType: string; dayType: string; timeType: string }
}
interface BayAvailability { bay: Bay; slots: SlotData[] }
interface Disclosure { id: string; title: string; body: string }
interface ReservedBooking { id: string; clientSecret: string | null; expiresAt: Date }
interface NextAvailable { date: Date; slot: SlotData; bay: Bay }

type Step = "date" | "time" | "review"

function PaymentForm({
  returnUrl,
  total,
  onError,
}: {
  returnUrl: string
  total: number
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!stripe || !elements) return
    setSubmitting(true)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) { onError(submitError.message ?? "Payment failed"); return }
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
      })
      if (error) onError(error.message ?? "Payment failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mt-5">
        <PaymentElement options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }} />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting || !stripe || !elements}
        className="btn-primary mt-5 w-full"
      >
        {submitting ? "Processing…" : `Pay $${total.toFixed(2)} and confirm`}
      </button>
      <p className="mt-2 text-center text-xs text-neutral-500">
        Payment processed securely by Stripe
      </p>
    </>
  )
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export default function BookingFlow({
  bays,
  advanceDays,
  membershipSlug,
  userName,
  disclosures,
  isAuthenticated,
}: {
  bays: Bay[]
  advanceDays: number
  membershipSlug: string | null
  userName: string
  disclosures: Disclosure[]
  isAuthenticated: boolean
}) {
  const router = useRouter()
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
  const [reservedBooking, setReservedBooking] = useState<ReservedBooking | null>(null)
  const [reserving, setReserving] = useState(false)
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECONDS)
  const [expiredError, setExpiredError] = useState("")
  const [acknowledgedDisclosures, setAcknowledgedDisclosures] = useState<Set<string>>(new Set())
  const [expandedDisclosure, setExpandedDisclosure] = useState<string | null>(disclosures[0]?.id ?? null)
  const [nextAvailable, setNextAvailable] = useState<NextAvailable | null | "loading">("loading")
  const cancellingRef = useRef(false)

  const allDisclosuresAcknowledged = disclosures.length === 0 || disclosures.every((d) => acknowledgedDisclosures.has(d.id))

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
        if (offset > 0) d.setHours(0, 0, 0, 0)
        // Snap to previous :00/:30 UTC boundary so slots always land on the half-hour
        const thirtyMin = 30 * 60 * 1000
        d.setTime(Math.floor(d.getTime() / thirtyMin) * thirtyMin)
        const res = await fetch(`/api/availability?date=${d.toISOString()}`)
        const data: BayAvailability[] = await res.json()
        if (!Array.isArray(data)) continue
        let best: NextAvailable | null = null
        for (const bayAvail of data) {
          for (let i = 0; i < bayAvail.slots.length - 1; i++) {
            const slot = bayAvail.slots[i]
            const next = bayAvail.slots[i + 1]
            if (slot.available && next.available) {
              if (!best || new Date(slot.startsAt) < new Date(best.slot.startsAt)) {
                const slotDate = new Date(d)
                slotDate.setHours(0, 0, 0, 0)
                best = { date: slotDate, slot, bay: bayAvail.bay }
              }
              break
            }
          }
        }
        if (best) {
          setNextAvailable(best)
          return
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

  // Countdown timer (only after slot is reserved)
  useEffect(() => {
    if (step !== "review" || !reservedBooking) return
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          handleExpiry()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [step, reservedBooking]) // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelReservation(id: string) {
    if (cancellingRef.current) return
    cancellingRef.current = true
    try {
      await fetch(`/api/bookings/${id}`, { method: "DELETE" })
    } finally {
      cancellingRef.current = false
    }
  }

  function handleExpiry() {
    const id = reservedBooking?.id
    setReservedBooking(null)
    setTimeLeft(EXPIRY_SECONDS)
    setStep("date")
    setSelectedBay(null)
    setSelectedStart(null)
    setAcknowledgedDisclosures(new Set())
    setExpiredError("Your reservation expired. Please start over and complete payment within 15 minutes.")
    if (id) cancelReservation(id)
  }

  async function handleReserve() {
    if (!selectedBay || !selectedStart || reserving) return
    setReserving(true)
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
        setBookingError(data.error ?? "Could not reserve slot")
        return
      }
      if (data.clientSecret === null) {
        // Gift card covered full amount, booking already confirmed
        router.push(`/account/bookings?confirmed=${data.bookingId}`)
        return
      }
      setReservedBooking({
        id: data.bookingId,
        clientSecret: data.clientSecret,
        expiresAt: new Date(Date.now() + EXPIRY_SECONDS * 1000),
      })
      setTimeLeft(EXPIRY_SECONDS)
    } catch {
      setBookingError("Could not reserve slot. Please try again")
    } finally {
      setReserving(false)
    }
  }

  // Merged slots: available if ANY bay has the slot open
  function getMergedSlots(): SlotData[] {
    const seen = new Map<string, SlotData>()
    for (const bayAvail of availability) {
      for (const slot of bayAvail.slots) {
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

  const calendarDays = buildCalendarDays(calendarMonth)
  const mergedSlots = getMergedSlots()
  const urgentTimer = timeLeft <= 120

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
                  Next available: {formatNextAvailableDate(nextAvailable.date)} at {nextAvailable.slot.label}
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
          {expiredError && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {expiredError}
            </div>
          )}
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
                      {slot.label}
                    </button>
                  )
                })}
              </div>

              {selectedStart && pricingPreview && (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-neutral-300">
                      <Clock size={14} /> {selectedDuration / 60}hr session starting {selectedStart.label}
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

      {/* ── Step 3: Review + disclosures ── */}
      {step === "review" && selectedStart && selectedBay && pricingPreview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={async () => {
                const id = reservedBooking?.id
                setReservedBooking(null)
                setTimeLeft(EXPIRY_SECONDS)
                setAcknowledgedDisclosures(new Set())
                setStep("time")
                if (id) await cancelReservation(id)
              }}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
            >
              <ChevronLeft size={14} /> Back
            </button>
            {reservedBooking && reservedBooking.clientSecret && (
              <div className={[
                "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                urgentTimer
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30",
              ].join(" ")}>
                <Timer size={12} />
                {formatCountdown(timeLeft)}
              </div>
            )}
          </div>

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

          {/* Coupon / gift card disabled once reserved */}
          <div className="mt-5">
            <label className="label" htmlFor="couponCode">Coupon code</label>
            <input
              id="couponCode"
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="input mt-1"
              disabled={!!reservedBooking}
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
              disabled={!!reservedBooking}
            />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="font-semibold text-white">Total due</span>
            <span className="text-xl font-bold text-white">${pricingPreview.total.toFixed(2)}</span>
          </div>

          {/* Disclosures: expandable accordion, shown before slot is reserved */}
          {!reservedBooking && disclosures.length > 0 && (
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

          {/* Reserve button (before slot is held) */}
          {!reservedBooking && (
            <button
              onClick={handleReserve}
              disabled={reserving || !allDisclosuresAcknowledged}
              className="btn-primary mt-5 w-full"
            >
              {reserving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Reserving slot…
                </span>
              ) : (
                disclosures.length > 0 && !allDisclosuresAcknowledged
                  ? `Acknowledge all ${disclosures.length} items to continue`
                  : "Reserve slot"
              )}
            </button>
          )}

          {/* Payment form (after slot is reserved) */}
          {reservedBooking && reservedBooking.clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: reservedBooking.clientSecret,
                appearance: { theme: "night" },
              }}
            >
              <PaymentForm
                returnUrl={`${window.location.origin}/account/bookings?confirmed=${reservedBooking.id}`}
                total={pricingPreview.total}
                onError={setBookingError}
              />
            </Elements>
          )}
        </div>
      )}
    </div>
  )
}
