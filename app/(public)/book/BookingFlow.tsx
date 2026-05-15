"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { loadStripe } from "@stripe/stripe-js"
import { ChevronLeft, ChevronRight, Clock, DollarSign, Timer } from "lucide-react"

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
interface ReservedBooking { id: string; clientSecret: string; expiresAt: Date }

type Step = "date" | "bay" | "time" | "review" | "payment"

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
  const [reservedBooking, setReservedBooking] = useState<ReservedBooking | null>(null)
  const [reserving, setReserving] = useState(false)
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECONDS)
  const [expiredError, setExpiredError] = useState("")
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([])
  const cancellingRef = useRef(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + advanceDays)

  const allDisclosuresAcknowledged = disclosures.length === 0 || acknowledgedIds.length >= disclosures.length

  const loadAvailability = useCallback(async (date: Date, bayId?: string) => {
    setLoadingSlots(true)
    try {
      const params = new URLSearchParams({ date: date.toISOString() })
      if (bayId) params.set("bayId", bayId)
      const res = await fetch(`/api/availability?${params}`)
      const data = await res.json()
      setAvailability(Array.isArray(data) ? data : [])
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDate && step === "bay") {
      loadAvailability(selectedDate)
    }
    if (selectedDate && selectedBay && step === "time") {
      loadAvailability(selectedDate, selectedBay.id)
    }
  }, [selectedDate, selectedBay, step, loadAvailability])

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
    setAcknowledgedIds([])
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
          disclosureIds: acknowledgedIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBookingError(data.error ?? "Could not reserve slot")
        return
      }
      setReservedBooking({
        id: data.bookingId,
        clientSecret: data.clientSecret,
        expiresAt: new Date(Date.now() + EXPIRY_SECONDS * 1000),
      })
      setTimeLeft(EXPIRY_SECONDS)
    } catch {
      setBookingError("Could not reserve slot — please try again")
    } finally {
      setReserving(false)
    }
  }

  async function handleConfirmBooking() {
    if (!reservedBooking) return
    setSubmitting(true)
    setBookingError("")
    try {
      const stripe = await stripePromise
      if (!stripe) return
      const { error } = await stripe.confirmPayment({
        clientSecret: reservedBooking.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/account/bookings?confirmed=${reservedBooking.id}`,
        },
      })
      if (error) {
        setBookingError(error.message ?? "Payment failed")
      }
    } finally {
      setSubmitting(false)
    }
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

  const currentBaySlots =
    availability.find((a) => a.bay.id === selectedBay?.id)?.slots ?? []

  function countAvailableConsecutive(startIndex: number, durationMins: number): boolean {
    const needed = durationMins / 30
    for (let i = 0; i < needed; i++) {
      if (!currentBaySlots[startIndex + i]?.available) return false
    }
    return true
  }

  const pricingPreview = selectedStart
    ? calculateBookingPrice({
        pricePerHour: selectedStart.pricePerHour,
        durationMinutes: selectedDuration,
        context: getPricingContext(new Date(selectedStart.startsAt)),
      })
    : null

  const calendarDays = buildCalendarDays(calendarMonth)
  const urgentTimer = timeLeft <= 120

  return (
    <div className="mt-8 space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["date", "bay", "time", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-600">›</span>}
            <span className={step === s ? "font-semibold text-brand" : "text-neutral-500 capitalize"}>
              {s}
            </span>
          </div>
        ))}
      </div>

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
                  onClick={() => { if (date) { setSelectedDate(date); setExpiredError("") } }}
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

          <div className="mt-6 flex justify-end">
            <button
              disabled={!selectedDate}
              onClick={() => setStep("bay")}
              className="btn-primary"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Bay selection ── */}
      {step === "bay" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("date")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Select a bay — {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          {loadingSlots ? (
            <p className="text-sm text-neutral-400">Checking availability…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {bays.map((bay) => {
                const bayData = availability.find((a) => a.bay.id === bay.id)
                const openSlots = bayData?.slots.filter((s) => s.available).length ?? 0
                return (
                  <button
                    key={bay.id}
                    onClick={() => { setSelectedBay(bay); setStep("time") }}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-brand/50 hover:bg-brand/10"
                  >
                    <p className="font-semibold text-white">{bay.name}</p>
                    <p className="mt-1 text-xs text-neutral-400">{openSlots} slots open</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Time + duration ── */}
      {step === "time" && selectedBay && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("bay")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {selectedBay.name} — {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          <div className="mb-5 mt-4">
            <p className="mb-2 text-sm text-neutral-400">Session length</p>
            <div className="flex flex-wrap gap-2">
              {[60, 90, 120, 150, 180, 210, 240].map((mins) => (
                <button
                  key={mins}
                  onClick={() => { setSelectedDuration(mins); setSelectedStart(null) }}
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
                {currentBaySlots.map((slot, i) => {
                  const canFit = countAvailableConsecutive(i, selectedDuration)
                  const isSelected = selectedStart?.startsAt === slot.startsAt
                  return (
                    <button
                      key={slot.startsAt}
                      disabled={!slot.available || !canFit}
                      onClick={() => setSelectedStart(slot)}
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

      {/* ── Step 4: Review + disclosures ── */}
      {step === "review" && selectedStart && selectedBay && pricingPreview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={async () => {
                const id = reservedBooking?.id
                setReservedBooking(null)
                setTimeLeft(EXPIRY_SECONDS)
                setAcknowledgedIds([])
                setStep("time")
                if (id) await cancelReservation(id)
              }}
              className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white"
            >
              <ChevronLeft size={14} /> Back
            </button>
            {reservedBooking && (
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
              <span>{selectedBay.name}</span>
              <span>{selectedDate?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
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

          {/* Coupon code */}
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

          {/* Gift card */}
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

          {/* Disclosures — shown until slot is reserved */}
          {!reservedBooking && disclosures.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-neutral-300">Please review and acknowledge the following:</p>
              {disclosures.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <input
                    type="checkbox"
                    checked={acknowledgedIds.includes(d.id)}
                    onChange={(e) =>
                      setAcknowledgedIds((prev) =>
                        e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                      )
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{d.title}</p>
                    <p className="mt-0.5 max-h-20 overflow-y-auto text-xs text-neutral-400">{d.body}</p>
                  </div>
                </label>
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

          {/* Pay button (after slot is reserved) */}
          {reservedBooking && (
            <>
              <button
                onClick={handleConfirmBooking}
                disabled={submitting}
                className="btn-primary mt-5 w-full"
              >
                {submitting ? "Processing…" : `Pay $${pricingPreview.total.toFixed(2)} and confirm`}
              </button>
              <p className="mt-2 text-center text-xs text-neutral-500">
                Payment processed securely by Stripe
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
