"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { finalizeReschedule } from "../../actions"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

interface SlotData {
  startsAt: string
  endsAt: string
  label: string
  available: boolean
  pricePerHour: number
}
interface BayAvailability { bay: { id: string; name: string }; slots: SlotData[] }

interface ReschedulePreview {
  newPricing: { subtotal: number; membershipDiscount: number; tax: number; total: number }
  originalTotal: number
  delta: number
  rescheduleFee: number
  netCharge: number
  clientSecret?: string
  newBayId: string
  newBayName: string
  newStartsAt: string
  newEndsAt: string
  pricePerHour: number
}

function fmt(n: number) { return `$${Math.abs(n).toFixed(2)}` }

function DeltaLine({ label, value, green }: { label: string; value: number; green?: boolean }) {
  if (value === 0) return null
  return (
    <div className={`flex justify-between text-sm ${green ? "text-green-400" : "text-neutral-300"}`}>
      <span>{label}</span><span>{value < 0 ? "−" : ""}{fmt(value)}</span>
    </div>
  )
}

// ── Stripe payment sub-form ───────────────────────────────────────────────────
function PaymentForm({
  clientSecret, netCharge, originalBookingId, newStartsAt, newEndsAt, newBayId,
}: {
  clientSecret: string; netCharge: number; originalBookingId: string
  newStartsAt: string; newEndsAt: string; newBayId: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const paymentIntentId = clientSecret.split("_secret_")[0]

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError("")

    const returnUrl = new URL(`${window.location.origin}/account/bookings/${originalBookingId}/reschedule/return`)
    returnUrl.searchParams.set("newStartsAt", newStartsAt)
    returnUrl.searchParams.set("newEndsAt", newEndsAt)
    returnUrl.searchParams.set("newBayId", newBayId)
    returnUrl.searchParams.set("netCharge", String(netCharge))

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl.toString() },
      redirect: "if_required",
    })

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed")
      setSubmitting(false)
      return
    }

    if (paymentIntent?.status === "succeeded") {
      try {
        await finalizeReschedule({
          originalBookingId, newStartsAt, newEndsAt, newBayId,
          paymentIntentId, netCharge,
        })
        router.push("/account/bookings?rescheduled=1")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete reschedule")
        setSubmitting(false)
      }
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={submitting || !stripe} className="btn-primary w-full">
        {submitting ? "Processing…" : `Pay ${fmt(netCharge)} & reschedule`}
      </button>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RescheduleFlow({
  bookingId, originalTotal, durationMinutes, advanceDays,
}: {
  bookingId: string
  originalTotal: number
  durationMinutes: number
  advanceDays: number
}) {
  const router = useRouter()
  const [step, setStep] = useState<"date" | "time" | "confirm">("date")
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [availability, setAvailability] = useState<BayAvailability[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null)
  const [preview, setPreview] = useState<ReschedulePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState("")

  const [today] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + advanceDays)

  const loadSlots = useCallback(async (date: Date) => {
    setLoadingSlots(true)
    try {
      const res = await fetch(`/api/availability?date=${date.toISOString()}`)
      const data = await res.json()
      setAvailability(Array.isArray(data) ? data : [])
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDate && step === "time") loadSlots(selectedDate)
  }, [selectedDate, step, loadSlots])

  // Get merged available slots across all bays for the selected date
  function getMergedSlots(): SlotData[] {
    const seen = new Map<string, SlotData>()
    const midnight = selectedDate
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1)
      : null

    for (const bayAvail of availability) {
      for (const slot of bayAvail.slots) {
        const slotTime = new Date(slot.startsAt)
        if (selectedDate && slotTime < selectedDate) continue
        if (midnight && slotTime >= midnight) continue
        if (!seen.has(slot.startsAt)) seen.set(slot.startsAt, { ...slot, available: false })
        if (slot.available) seen.set(slot.startsAt, { ...slot, available: true })
      }
    }
    return Array.from(seen.values())
  }

  // Can a slot fit the required duration on at least one bay?
  function canFit(slotStartsAt: string): boolean {
    const needed = durationMinutes / 30
    for (const bayAvail of availability) {
      const idx = bayAvail.slots.findIndex((s) => s.startsAt === slotStartsAt)
      if (idx === -1) continue
      let fits = true
      for (let i = 0; i < needed; i++) {
        if (!bayAvail.slots[idx + i]?.available) { fits = false; break }
      }
      if (fits) return true
    }
    return false
  }

  async function handleSelectSlot(slot: SlotData) {
    setSelectedSlot(slot)
    setPreview(null)
    setPreviewError("")
    setPreviewLoading(true)
    try {
      const res = await fetch("/api/bookings/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, newStartsAt: slot.startsAt }),
      })
      const data = await res.json()
      if (!res.ok) { setPreviewError(data.error ?? "Failed to preview"); return }
      setPreview(data)
      setStep("confirm")
    } catch {
      setPreviewError("Something went wrong")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirmNoCharge() {
    if (!preview) return
    setConfirming(true)
    setConfirmError("")
    try {
      await finalizeReschedule({
        originalBookingId: bookingId,
        newStartsAt: preview.newStartsAt,
        newEndsAt: preview.newEndsAt,
        newBayId: preview.newBayId,
        netCharge: preview.netCharge,
      })
      router.push("/account/bookings?rescheduled=1")
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Something went wrong")
      setConfirming(false)
    }
  }

  function buildCalendarDays(month: Date): (Date | null)[] {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
    return cells
  }

  function isSelectable(date: Date | null): boolean {
    if (!date) return false
    const d = new Date(date); d.setHours(0, 0, 0, 0)
    return d >= today && d <= maxDate
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  }

  const calendarDays = buildCalendarDays(calendarMonth)
  const mergedSlots = getMergedSlots()

  return (
    <div className="space-y-6">

      {/* ── Step 1: Date ── */}
      {step === "date" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Choose a new date</h2>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))} className="btn-ghost p-2">
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-white">{MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))} className="btn-ghost p-2">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500 mb-1">
            {DAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, i) => {
              const selectable = isSelectable(date)
              const isSelected = selectedDate && date && date.toDateString() === selectedDate.toDateString()
              return (
                <button
                  key={i}
                  disabled={!selectable}
                  onClick={() => {
                    if (!date) return
                    setSelectedDate(date)
                    setSelectedSlot(null)
                    setStep("time")
                  }}
                  className={[
                    "rounded-lg py-2 text-sm transition",
                    !date ? "invisible" : "",
                    selectable
                      ? isSelected ? "bg-brand text-white font-semibold" : "text-white hover:bg-white/10"
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

      {/* ── Step 2: Time ── */}
      {step === "time" && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <button onClick={() => setStep("date")} className="mb-4 flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>
          <h2 className="mb-4 text-lg font-semibold text-white">
            {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            Session length: {durationMinutes / 60} hr{durationMinutes > 60 ? "s" : ""} (same as original)
          </p>
          {loadingSlots ? (
            <p className="text-sm text-neutral-400">Loading availability…</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-400">Select start time</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {mergedSlots.map((slot) => {
                  const fits = canFit(slot.startsAt)
                  const isSelected = selectedSlot?.startsAt === slot.startsAt
                  const available = slot.available && fits
                  return (
                    <button
                      key={slot.startsAt}
                      disabled={!available || previewLoading}
                      onClick={() => handleSelectSlot(slot)}
                      className={[
                        "rounded-lg border py-2 text-xs transition",
                        available
                          ? isSelected ? "border-brand bg-brand/20 text-brand font-semibold" : "border-white/10 text-white hover:border-white/30"
                          : "cursor-not-allowed border-white/5 text-neutral-700",
                      ].join(" ")}
                    >
                      {fmtTime(slot.startsAt)}
                    </button>
                  )
                })}
              </div>
              {previewLoading && <p className="mt-4 text-sm text-neutral-400">Calculating pricing…</p>}
              {previewError && <p className="mt-4 text-sm text-red-400">{previewError}</p>}
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === "confirm" && preview && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
          <button onClick={() => setStep("time")} className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white">
            <ChevronLeft size={14} /> Back
          </button>

          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Confirm reschedule</h2>
            <p className="text-sm text-neutral-400">
              {new Date(preview.newStartsAt).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", timeZone: "America/Indiana/Indianapolis",
              })}
              {" · "}
              {fmtTime(preview.newStartsAt)} – {fmtTime(preview.newEndsAt)}
              {" · "}{preview.newBayName}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Pricing adjustment</p>
            <div className="flex justify-between text-sm text-neutral-400">
              <span>Originally paid</span><span>{fmt(preview.originalTotal)}</span>
            </div>
            <DeltaLine label="New session price" value={preview.newPricing.total} />
            <div className="border-t border-white/10 pt-2 space-y-1.5">
              {preview.delta !== 0 && (
                <DeltaLine
                  label={preview.delta > 0 ? "Price difference" : "Price difference (refund)"}
                  value={preview.delta}
                  green={preview.delta < 0}
                />
              )}
              <div className="flex justify-between text-sm text-neutral-400">
                <span>Reschedule fee</span><span>{fmt(preview.rescheduleFee)}</span>
              </div>
            </div>
            <div className="border-t border-white/10 pt-2">
              {preview.netCharge > 0 ? (
                <div className="flex justify-between font-bold text-white">
                  <span>Amount due</span><span>{fmt(preview.netCharge)}</span>
                </div>
              ) : preview.netCharge < 0 ? (
                <div className="flex justify-between font-bold text-green-400">
                  <span>Refund to original payment method</span><span>{fmt(Math.abs(preview.netCharge))}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm text-neutral-400">
                  <span>No charge or refund</span><span>—</span>
                </div>
              )}
            </div>
          </div>

          {/* New breakdown */}
          <div className="text-xs text-neutral-500 space-y-1 border-t border-white/10 pt-4">
            <p className="font-semibold text-neutral-400 mb-2">New booking receipt</p>
            <div className="flex justify-between"><span>Subtotal</span><span>{fmt(preview.newPricing.subtotal)}</span></div>
            {preview.newPricing.membershipDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Member discount</span><span>−{fmt(preview.newPricing.membershipDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between"><span>Indiana sales tax (7%)</span><span>{fmt(preview.newPricing.tax)}</span></div>
            <div className="flex justify-between font-semibold text-neutral-300">
              <span>New total</span><span>{fmt(preview.newPricing.total)}</span>
            </div>
          </div>

          {confirmError && <p className="text-sm text-red-400">{confirmError}</p>}

          {/* Payment or free confirm */}
          {preview.clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret: preview.clientSecret, appearance: { theme: "night" } }}>
              <PaymentForm
                clientSecret={preview.clientSecret}
                netCharge={preview.netCharge}
                originalBookingId={bookingId}
                newStartsAt={preview.newStartsAt}
                newEndsAt={preview.newEndsAt}
                newBayId={preview.newBayId}
              />
            </Elements>
          ) : (
            <button
              onClick={handleConfirmNoCharge}
              disabled={confirming}
              className="btn-primary w-full"
            >
              {confirming ? "Rescheduling…" : preview.netCharge < 0
                ? `Confirm & get ${fmt(Math.abs(preview.netCharge))} refund`
                : "Confirm reschedule"}
            </button>
          )}

          <p className="text-center text-xs text-neutral-600">
            By rescheduling you agree to our{" "}
            <a href="/terms" className="underline hover:text-neutral-400">cancellation policy</a>.
            Reschedule fee is non-refundable.
          </p>
        </div>
      )}
    </div>
  )
}
