"use client"

import { useState, useEffect, useCallback } from "react"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import { loadStripe } from "@stripe/stripe-js"
import { ChevronLeft, ChevronRight, Clock, DollarSign, ChevronDown, ChevronUp } from "lucide-react"

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

type Step = "date" | "bay" | "time" | "review" | "payment"

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
  const allDisclosuresAcknowledged = disclosures.every((d) => acknowledgedDisclosures.has(d.id))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + advanceDays)

  // Load availability when date or bay changes
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

  // Slot helpers
  const currentBaySlots =
    availability.find((a) => a.bay.id === selectedBay?.id)?.slots ?? []

  function countAvailableConsecutive(startIndex: number, durationMins: number): boolean {
    const needed = durationMins / 30
    for (let i = 0; i < needed; i++) {
      if (!currentBaySlots[startIndex + i]?.available) return false
    }
    return true
  }

  // Pricing preview
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

      // Redirect to Stripe payment
      const stripe = await stripePromise
      if (!stripe) return

      const { error } = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/account/bookings?confirmed=${data.bookingId}`,
        },
      })

      if (error) {
        setBookingError(error.message ?? "Payment failed")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const calendarDays = buildCalendarDays(calendarMonth)

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
                  onClick={() => date && setSelectedDate(date)}
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

          {/* Duration selector */}
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

      {/* ── Step 4: Review + discounts ── */}
      {step === "review" && selectedStart && selectedBay && pricingPreview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("time")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
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
            />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="font-semibold text-white">Total due</span>
            <span className="text-xl font-bold text-white">${pricingPreview.total.toFixed(2)}</span>
          </div>

          {/* Disclosures */}
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
