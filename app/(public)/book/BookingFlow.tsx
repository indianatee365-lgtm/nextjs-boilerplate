"use client"

import { clarityEvent } from "@/lib/clarity"
import { Fragment, useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { trackFunnel } from "@/lib/funnel"
import { calculateBookingPrice, getPricingContext } from "@/lib/pricing/engine"
import {
  GROUNDS_CREW_BOOK_AHEAD_HOURS,
  groundsCrewDateKey,
  groundsCrewFreeMinutes,
  minutesInGroundsCrewWindow,
} from "@/lib/membership/grounds-crew"
import { pickBestBay, slotGridGap, type BayUsage } from "@/lib/bookings/bay-selection"
import { addDaysToDateKey, easternDateKey } from "@/lib/time/eastern"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { ChevronLeft, ChevronRight, Clock, DollarSign, ChevronDown, ChevronUp, Zap, Timer, CalendarDays } from "lucide-react"

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
interface ReservedBooking { id: string; clientSecret: string | null; customerSessionClientSecret: string | null; amountDue: number | null; expiresAt: Date }

type CouponCheck =
  | { code: string; valid: true; discountType: "percent" | "fixed"; discountValue: number }
  | { code: string; valid: false; error: string }
interface NextAvailable { date: Date; slot: SlotData; bay: Bay }

type Step = "date" | "time" | "review"

function PaymentForm({
  returnUrl,
  total,
  onError,
  onLoadError,
}: {
  returnUrl: string
  total: number
  onError: (msg: string) => void
  onLoadError?: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!stripe || !elements) return
    setSubmitting(true)
    let paid = false
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) { onError(submitError.message ?? "Payment failed"); return }
      // redirect "if_required": card payments resolve here instead of Stripe
      // navigating away, so Clarity can record the purchase first. Payments
      // that need a bank redirect (3D Secure) still go through return_url.
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      })
      if (error) {
        // A declined card no longer releases the slot (see the Stripe
        // webhook), so say the hold is still there and they can try again.
        onError(error.type === "card_error"
          ? `${error.message ?? "Your card was declined."} Your bay is still held. Try another card or payment method.`
          : (error.message ?? "Payment failed"))
        return
      }
      clarityEvent("book_paid")
      paid = true
      window.location.assign(returnUrl)
    } finally {
      // Stay on "Processing" while the confirmation page loads.
      if (!paid) setSubmitting(false)
    }
  }

  return (
    <>
      <div className="mt-5">
        <PaymentElement
          options={{ wallets: { applePay: "auto", googlePay: "auto", link: "never" } as never }}
          onLoadError={onLoadError}
        />
        {/* Every booking payment saves the card (setup_future_usage in
            lib/bookings/create.ts), with no checkbox, so say so. Customers
            assumed we didn't save cards at all (Chase, 2026-10-25). */}
        <p className="mt-3 text-xs text-neutral-400">
          Your card is saved to your account so next time is one tap. Manage your cards in{" "}
          <a href="/account" className="text-brand underline underline-offset-2">My Account</a>.
        </p>
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

// "YYYY-MM-DD" to a local-midnight Date, matching how the calendar builds its
// own cells with new Date(year, month, day). Deliberately NOT new Date(str),
// which parses a bare date as UTC and lands on the previous day for everyone
// west of Greenwich - the exact day-boundary bug this codebase keeps hitting.
function parseLocalDate(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

// The reverse of parseLocalDate, for links back to /book.
function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function durationLabel(mins: number): string {
  return `${mins / 60}hr${mins > 60 ? "s" : ""}`
}

// Weekday of a slot in the facility's timezone ("Sat" or "Saturday").
function slotDayLabel(startsAt: string, weekday: "short" | "long"): string {
  return new Date(startsAt).toLocaleDateString("en-US", { timeZone: "America/Indiana/Indianapolis", weekday })
}

export default function BookingFlow({
  bays,
  advanceDays,
  membershipSlug,
  membershipDiscountPercent = 0,
  veteranDiscountPercent = 0,
  userName,
  disclosures,
  isAuthenticated,
  availableCreditHours = 0,
  groundsCrewAllowanceMinutes = 0,
  groundsCrewUsedByDay = {},
  twoBayEnabled = false,
  prefillCouponCode,
  minBookableDate,
  prefillDate,
  prefillDurationMinutes,
  prefillStart = null,
  prefillSecondBay = false,
  heldBooking = null,
}: {
  bays: Bay[]
  advanceDays: number
  membershipSlug: string | null
  membershipDiscountPercent?: number
  veteranDiscountPercent?: number
  userName: string
  disclosures: Disclosure[]
  isAuthenticated: boolean
  availableCreditHours?: number
  groundsCrewAllowanceMinutes?: number
  groundsCrewUsedByDay?: Record<string, number>
  twoBayEnabled?: boolean
  prefillCouponCode?: string
  minBookableDate?: string | null
  prefillDate?: string | null
  prefillDurationMinutes?: number | null
  prefillStart?: string | null
  prefillSecondBay?: boolean
  heldBooking?: { id: string; bayName: string; startsAt: string; total: number } | null
}) {
  const router = useRouter()
  // A link texted by the phone agent arrives as /book?date=&duration=. Landing
  // straight on the time grid for that day is the whole point: the caller has
  // already said what they want, so the only thing left is to pick a time that
  // is genuinely open. The date is range-checked server-side before it reaches
  // here, so if it is set it is safe to jump past the calendar.
  //
  // With nothing prefilled the page opens on today's times too, not a
  // calendar: most bookings are made the same day (68% under 3 hours before
  // the start, Nov 2026), and the calendar step was where most visitors left.
  // Today is the Eastern date so the server render and the browser agree.
  const prefilledDate = parseLocalDate(prefillDate)
  const todayKey = easternDateKey(new Date())
  const [step, setStep] = useState<Step>("time")
  const [selectedDate, setSelectedDate] = useState<Date | null>(prefilledDate ?? parseLocalDate(todayKey))

  // Booking funnel (/admin/funnel): reaching the time grid means a date was
  // picked, reaching review means a time was. Repeats are ignored server-side.
  useEffect(() => {
    trackFunnel(step === "date" ? "view" : step === "time" ? "date" : "time")
    if (step !== "date") trackFunnel("view")
  }, [step])
  const [selectedBay, setSelectedBay] = useState<Bay | null>(null)
  const [selectedStart, setSelectedStart] = useState<SlotData | null>(null)
  const [selectedDuration, setSelectedDuration] = useState(prefillDurationMinutes ?? 60)
  const [couponCode, setCouponCode] = useState(prefillCouponCode ?? "")
  const [giftCardCode, setGiftCardCode] = useState("")
  // Result of checking the typed coupon, so "Total due" can show the discount
  // before the slot is reserved. Until 2026-10-25 the page never included
  // coupons or gift cards in its own total and showed full price on the Pay
  // button, even though the server charged the discounted amount.
  const [couponCheck, setCouponCheck] = useState<CouponCheck | null>(null)
  const [useFreeHours, setUseFreeHours] = useState(true)
  const [wantSecondBay, setWantSecondBay] = useState(false)
  const [availability, setAvailability] = useState<BayAvailability[]>([])
  // Starts true because the page opens on the time grid, so the first render
  // says "Loading" rather than "nothing left today".
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [calendarMonth, setCalendarMonth] = useState(prefilledDate ?? new Date())
  const [bookingError, setBookingError] = useState("")
  const [reservedBooking, setReservedBooking] = useState<ReservedBooking | null>(null)
  // If the payment form ever fails to load with saved cards on, reload it as
  // the plain card form so a customer can always pay.
  const [savedCardsFailed, setSavedCardsFailed] = useState(false)

  // Check the typed coupon after a short pause so Total due can include it.
  useEffect(() => {
    const code = couponCode.trim()
    if (!code || !isAuthenticated || reservedBooking) return
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/coupons/check?code=${encodeURIComponent(code)}`)
        const data = await res.json()
        setCouponCheck(
          data.valid
            ? { code, valid: true, discountType: data.discountType, discountValue: Number(data.discountValue) }
            : { code, valid: false, error: data.error ?? "Invalid coupon code" },
        )
      } catch {
        setCouponCheck({ code, valid: false, error: "Couldn't check that code. If it's valid it still applies when you reserve." })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [couponCode, isAuthenticated, reservedBooking])
  const [reserving, setReserving] = useState(false)
  // Set once a booking has been created and we are leaving for the confirmation
  // page. Never cleared: there is nothing left on this screen to reserve.
  const [navigatingToBooking, setNavigatingToBooking] = useState(false)
  const [timeLeft, setTimeLeft] = useState(EXPIRY_SECONDS)
  const [expiredError, setExpiredError] = useState("")
  const [acknowledgedDisclosures, setAcknowledgedDisclosures] = useState<Set<string>>(new Set())
  const [expandedDisclosure, setExpandedDisclosure] = useState<string | null>(disclosures[0]?.id ?? null)
  const [nextAvailable, setNextAvailable] = useState<NextAvailable | null | "loading">("loading")
  const cancellingRef = useRef(false)
  const [unfinishedHold, setUnfinishedHold] = useState(heldBooking)
  const [releasingHold, setReleasingHold] = useState(false)

  const allDisclosuresAcknowledged = disclosures.length === 0 || disclosures.every((d) => acknowledgedDisclosures.has(d.id))

  // Eastern, like todayKey, so the day strip renders the same on the server
  // (UTC) as in the browser.
  const today = parseLocalDate(todayKey) ?? new Date()
  const maxDate = parseLocalDate(addDaysToDateKey(todayKey, advanceDays)) ?? new Date()

  // Floor on top of the today/maxDate range - mirrors create.ts's own
  // eligibility check (isEarlyAccessEligibleSession/isPublicBookingOpen) so
  // the calendar can't offer a date the backend will reject anyway. null
  // for admin (no floor). Compared at local midnight like today/maxDate,
  // not the exact UTC instant, since a whole calendar day either is or
  // isn't selectable here - the exact instant still gets enforced for real
  // by create.ts at submission.
  const minDate = minBookableDate ? new Date(minBookableDate) : null
  if (minDate) minDate.setHours(0, 0, 0, 0)

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
      // Same floor as isDateSelectable - without this, a non-founder saw
      // (and could one-click "Book now" on) a same-day slot months before
      // they're actually eligible for it, since this search always started
      // from "now" regardless of who's asking. Found live 2026-08-24.
      const todayMidnight = new Date(now)
      todayMidnight.setHours(0, 0, 0, 0)
      const startOffset = minDate && minDate > todayMidnight
        ? Math.round((minDate.getTime() - todayMidnight.getTime()) / 86400000)
        : 0
      for (let offset = startOffset; offset <= Math.min(advanceDays, startOffset + 7); offset++) {
        const d = new Date(now)
        d.setDate(d.getDate() + offset)
        if (offset > 0) d.setHours(0, 0, 0, 0)
        // Snap to previous :00/:30 UTC boundary so slots always land on the half-hour
        const thirtyMin = 30 * 60 * 1000
        d.setTime(Math.floor(d.getTime() / thirtyMin) * thirtyMin)
        const res = await fetch(`/api/availability?date=${d.toISOString()}`)
        const data: BayAvailability[] = await res.json()
        if (!Array.isArray(data)) continue

        // Find the single earliest moment ANY bay opens up today, then let
        // pickBestBay() choose among every bay that shares that exact
        // earliest slot - same spacing/fairness logic as findBayForSlot,
        // just applied to "whichever bay opens soonest" instead of a bay
        // the customer already committed to a specific time for.
        let bestTime: string | null = null
        let bestSlot: SlotData | null = null
        let tiedCandidates: Bay[] = []
        // The browser has no booking history, only today's availability grid,
        // so it approximates wear from how much of the day each bay is
        // already taken. It is a preview only: the server never trusts the
        // bay the client picked (see lib/bookings/create.ts) and re-runs the
        // selection against real 30-day usage. Same shape so both sides go
        // through one code path.
        const usageByBayId = new Map<string, BayUsage>()
        const adjacencyByBayId = new Map<string, number>()

        for (const bayAvail of data) {
          usageByBayId.set(bayAvail.bay.id, {
            minutes: bayAvail.slots.filter((s) => !s.available).length * 30,
            lastUsedAt: null,
          })
          let firstOpenSlot: SlotData | null = null
          for (let i = 0; i < bayAvail.slots.length - 1; i++) {
            const slot = bayAvail.slots[i]
            const next = bayAvail.slots[i + 1]
            if (slot.available && next.available) { firstOpenSlot = slot; break }
          }
          if (!firstOpenSlot) continue

          if (!bestTime || new Date(firstOpenSlot.startsAt) < new Date(bestTime)) {
            bestTime = firstOpenSlot.startsAt
            bestSlot = firstOpenSlot
            tiedCandidates = [bayAvail.bay]
          } else if (firstOpenSlot.startsAt === bestTime) {
            tiedCandidates.push(bayAvail.bay)
          }
        }

        // A bay only counts as "busy" for spacing purposes if it's actually
        // occupied AT bestTime - not "has zero openings for the rest of the
        // entire day", which the old busyBayNumbers (built in the loop
        // above) actually checked. That's nearly always empty (bays rarely
        // stay fully booked all day), so spacing silently never applied on
        // this "Book now" shortcut - confirmed live 2026-09-06: a customer
        // landed in bay 3 immediately next to an already-occupied bay 4
        // even with bay 1 and bay 2 both wide open the whole time, because
        // bay 4 still had later-in-the-day openings and so never registered
        // as busy here. findBayForSlot (the manual time-picker) never had
        // this bug - it already checks availability at the specific
        // requested time, not "ever available today".
        const busyBayNumbers: number[] = []
        if (bestTime) {
          for (const bayAvail of data) {
            const slotAtBestTime = bayAvail.slots.find((s) => s.startsAt === bestTime)
            if (!slotAtBestTime?.available) busyBayNumbers.push(bayAvail.bay.number)
          }
        }

        // Clear air either side of the slot each bay is offering, so the
        // preview picks the same bay the server will.
        if (bestTime) {
          for (const bayAvail of data) {
            const idx = bayAvail.slots.findIndex((s) => s.startsAt === bestTime)
            if (idx === -1) continue
            adjacencyByBayId.set(bayAvail.bay.id, slotGridGap(bayAvail.slots, idx, 2))
          }
        }

        if (bestSlot) {
          const bay = pickBestBay(tiedCandidates, busyBayNumbers, usageByBayId, adjacencyByBayId)
          if (bay) {
            const slotDate = new Date(d)
            slotDate.setHours(0, 0, 0, 0)
            setNextAvailable({ date: slotDate, slot: bestSlot, bay })
            return
          }
        }
      }
      setNextAvailable(null)
    }
    findNextAvailable()
  }, [advanceDays, minBookableDate])

  useEffect(() => {
    if (selectedDate && step === "time") {
      loadAvailability(selectedDate)
    }
  }, [selectedDate, step, loadAvailability])

  // Back from sign-in (see signInHref): once the day has loaded, put the guest
  // straight back on the review step for the time they picked, or tell them it
  // went and leave them on that day's grid. Runs once.
  const restoreStartRef = useRef(prefillStart)
  const [restoreNote, setRestoreNote] = useState("")
  useEffect(() => {
    const wanted = restoreStartRef.current
    if (!wanted || loadingSlots || step !== "time" || availability.length === 0) return
    restoreStartRef.current = null
    trackFunnel("returned")
    const slot = getMergedSlots().find((s) => new Date(s.startsAt).getTime() === new Date(wanted).getTime())
    if (
      slot?.available &&
      new Date(slot.startsAt).getTime() > Date.now() &&
      canFitDurationOnAnyBay(slot.startsAt, selectedDuration)
    ) {
      setSelectedStart(slot)
      setSelectedBay(findBayForSlot(slot.startsAt, selectedDuration))
      setWantSecondBay(prefillSecondBay)
      setStep("review")
    } else {
      setRestoreNote("The time you picked was just booked. These are the times still open that day.")
    }
  }, [availability, loadingSlots, step]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Record acknowledgements against the held booking the moment they are all
  // ticked, so the audit row (with its body snapshot) exists before payment
  // rather than after it. Reuses the same endpoint the phone-booking
  // completion page uses. Fires once per booking - the ref guard stops a
  // re-render or a re-tick sending it again.
  const disclosuresPostedFor = useRef<string | null>(null)
  useEffect(() => {
    const id = reservedBooking?.id
    if (!id || !allDisclosuresAcknowledged || disclosures.length === 0) return
    if (disclosuresPostedFor.current === id) return
    disclosuresPostedFor.current = id
    fetch(`/api/bookings/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disclosureIds: Array.from(acknowledgedDisclosures) }),
    }).catch(() => {
      // Non-fatal: createBooking's own confirmation path is what gates the
      // booking, and the customer should not be blocked from paying because an
      // audit write blipped. Allow a retry on the next tick.
      disclosuresPostedFor.current = null
    })
  }, [reservedBooking, allDisclosuresAcknowledged, acknowledgedDisclosures, disclosures.length])

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
    // Browsing is public, reserving is not. Send a guest to sign in rather than
    // firing a POST that /api/bookings would reject with a 401 and no
    // explanation. `return` brings them straight back to the time they picked.
    if (!isAuthenticated) {
      trackFunnel("login")
      router.push(signInHref())
      return
    }
    setReserving(true)
    setBookingError("")
    // Tracked locally as well as in state because the `finally` below runs
    // before a state update would be visible, and it must not re-arm the button
    // when a booking has already been made.
    let booked = false
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
          applyHourCredits: useFreeHours && availableCreditHours > 0,
          secondBay: secondBayOn,
          // Disclosures are acknowledged after the slot is held, immediately
          // before payment, and recorded through /api/bookings/[id]/complete.
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBookingError(data.error ?? "Could not reserve slot")
        return
      }
      if (data.clientSecret === null) {
        // Hour credits or a gift card covered the full amount, so the booking
        // is already confirmed. Nothing further can be reserved here, and the
        // navigation takes a moment, so the button stays dead and says so.
        booked = true
        trackFunnel("reserved", data.bookingId)
        setNavigatingToBooking(true)
        router.push(`/account/bookings?confirmed=${data.bookingId}`)
        return
      }
      // The server released any earlier unpaid hold of theirs before taking
      // this one, so the "waiting for payment" banner no longer applies.
      setUnfinishedHold(null)
      trackFunnel("reserved", data.bookingId)
      setReservedBooking({
        id: data.bookingId,
        clientSecret: data.clientSecret,
        customerSessionClientSecret: data.customerSessionClientSecret ?? null,
        amountDue: typeof data.amountDue === "number" ? data.amountDue : null,
        expiresAt: new Date(Date.now() + EXPIRY_SECONDS * 1000),
      })
      setTimeLeft(EXPIRY_SECONDS)
    } catch {
      setBookingError("Could not reserve slot. Please try again")
    } finally {
      if (!booked) setReserving(false)
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

  // How many bays can take this whole booking, for "Add a second bay".
  function countBaysFitting(slotStartsAt: string, durationMins: number): number {
    const needed = durationMins / 30
    let count = 0
    for (const bayAvail of availability) {
      const startIdx = bayAvail.slots.findIndex((s) => s.startsAt === slotStartsAt)
      if (startIdx === -1) continue
      let fits = true
      for (let i = 0; i < needed; i++) {
        if (!bayAvail.slots[startIdx + i]?.available) { fits = false; break }
      }
      if (fits) count++
    }
    return count
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

  // Which bay a customer actually gets is pickBestBay()'s call (see
  // lib/bookings/bay-selection.ts) - prefers spacing away from whoever's
  // already booked around this same time, falls back to whichever bay has
  // the lighter load today so a quiet day doesn't always hand out the same
  // low-numbered bay. Never blocks a booking over spacing - if only one
  // bay fits, that's what gets returned regardless of distance.
  function findBayForSlot(slotStartsAt: string, durationMins: number): Bay | null {
    const needed = durationMins / 30
    const candidates: Bay[] = []
    const busyBayNumbers: number[] = []
    const usageByBayId = new Map<string, BayUsage>()
    const adjacencyByBayId = new Map<string, number>()

    for (const bayAvail of availability) {
      const startIdx = bayAvail.slots.findIndex((s) => s.startsAt === slotStartsAt)
      usageByBayId.set(bayAvail.bay.id, {
        minutes: bayAvail.slots.filter((s) => !s.available).length * 30,
        lastUsedAt: null,
      })
      if (startIdx === -1) { busyBayNumbers.push(bayAvail.bay.number); continue }

      let fits = true
      for (let i = 0; i < needed; i++) {
        if (!bayAvail.slots[startIdx + i]?.available) { fits = false; break }
      }
      if (fits) {
        candidates.push(bayAvail.bay)
        adjacencyByBayId.set(bayAvail.bay.id, slotGridGap(bayAvail.slots, startIdx, needed))
      } else {
        busyBayNumbers.push(bayAvail.bay.number)
      }
    }

    return pickBestBay(candidates, busyBayNumbers, usageByBayId, adjacencyByBayId)
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
    return d >= (minDate ?? today) && d <= maxDate
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

  // Grounds Crew (Albatross): same function the server charges with.
  const selectedStartDate = selectedStart ? new Date(selectedStart.startsAt) : null
  const groundsCrewMinutes = selectedStartDate
    ? groundsCrewFreeMinutes({
        startsAt: selectedStartDate,
        durationMinutes: selectedDuration,
        now: new Date(),
        dailyAllowanceMinutes: groundsCrewAllowanceMinutes,
        usedMinutesThatMorning: groundsCrewUsedByDay[groundsCrewDateKey(selectedStartDate)] ?? 0,
      })
    : 0
  const groundsCrewTooEarly =
    !!selectedStartDate &&
    groundsCrewAllowanceMinutes > 0 &&
    groundsCrewMinutes === 0 &&
    minutesInGroundsCrewWindow(selectedStartDate, selectedDuration) > 0 &&
    selectedStartDate.getTime() - Date.now() > GROUNDS_CREW_BOOK_AHEAD_HOURS * 3600 * 1000

  // Only a check for the code currently in the box counts, so editing the
  // code drops the old discount straight away.
  const couponApplied = couponCheck && couponCheck.valid && couponCheck.code === couponCode.trim() ? couponCheck : null
  const pricingPreview = selectedStart
    ? calculateBookingPrice({
        pricePerHour: selectedStart.pricePerHour,
        durationMinutes: selectedDuration,
        membershipDiscountPercent,
        veteranDiscountPercent,
        couponDiscountType: couponApplied?.discountType,
        couponDiscountValue: couponApplied?.discountValue ?? 0,
        creditHours: useFreeHours ? availableCreditHours : 0,
        groundsCrewHours: groundsCrewMinutes / 60,
        context: getPricingContext(new Date(selectedStart.startsAt)),
      })
    : null

  const calendarDays = buildCalendarDays(calendarMonth)
  const mergedSlots = getMergedSlots()

  // Two-bay booking. The second bay is quoted at the member, veteran and sale
  // rate the server charges (coupons, gift cards, hour credits and Grounds
  // Crew time stay with the first bay), and is only offered when a second
  // bay really fits the whole booking. When it doesn't, the nearest times on
  // the same day that do are offered instead.
  const secondBayAvailable = twoBayEnabled && !!selectedStart && countBaysFitting(selectedStart.startsAt, selectedDuration) >= 2
  const secondBayOn = wantSecondBay && secondBayAvailable
  const secondBayQuote = selectedStart
    ? calculateBookingPrice({
        pricePerHour: selectedStart.pricePerHour,
        durationMinutes: selectedDuration,
        membershipDiscountPercent,
        veteranDiscountPercent,
        context: getPricingContext(new Date(selectedStart.startsAt)),
      })
    : null
  const secondBayPreview = secondBayOn ? secondBayQuote : null
  const previewTotal = (pricingPreview?.total ?? 0) + (secondBayPreview?.total ?? 0)
  // Once the slot is held, show exactly what the server will charge (gift
  // cards included), not this page's own estimate.
  const displayTotal = reservedBooking?.amountDue ?? previewTotal
  const twoBayAlternatives = twoBayEnabled && selectedStart && !secondBayAvailable
    ? mergedSlots
        .filter((s) => s.available && s.startsAt !== selectedStart.startsAt && countBaysFitting(s.startsAt, selectedDuration) >= 2)
        .sort((a, b) =>
          Math.abs(new Date(a.startsAt).getTime() - new Date(selectedStart.startsAt).getTime()) -
          Math.abs(new Date(b.startsAt).getTime() - new Date(selectedStart.startsAt).getTime()))
        .slice(0, 3)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    : []
  const urgentTimer = timeLeft <= 120

  // Where a guest goes to sign in. Until Nov 2026 this was a bare
  // /login?return=/book, so after signing in (or creating an account, which
  // carries the same return) they landed on an empty page and had to pick
  // everything again. page.tsx validates these and BookingFlow restores them.
  function signInHref(): string {
    const params = new URLSearchParams()
    if (selectedDate) params.set("date", localDateKey(selectedDate))
    params.set("duration", String(selectedDuration))
    if (selectedStart) params.set("start", selectedStart.startsAt)
    if (secondBayOn) params.set("bays", "2")
    return `/login?return=${encodeURIComponent(`/book?${params.toString()}`)}`
  }

  // Day strip: today and the next few days one tap away, the full calendar
  // behind "Other date".
  const stripDays: { key: string; date: Date; top: string }[] = []
  for (let i = 0; i <= Math.min(advanceDays, 5); i++) {
    const key = addDaysToDateKey(todayKey, i)
    const date = parseLocalDate(key)
    if (!date || !isDateSelectable(date)) continue
    stripDays.push({ key, date, top: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DAYS[date.getDay()] })
  }
  const selectedKey = selectedDate ? localDateKey(selectedDate) : null
  const selectedInStrip = stripDays.some((d) => d.key === selectedKey)

  // Past times are never shown, and the grid starts at the first time that can
  // actually be booked, so a 7pm visitor is not scrolling past a screen of dead
  // buttons from this morning to find tonight.
  // Availability runs 4 hours past midnight so a late session can be checked
  // for room to finish, but those early-morning times belong to the next day's
  // grid. Showing them here put tomorrow's 1am under today with no date, and
  // the very last one always read as booked because nothing after it is loaded.
  const gridDayKey = mergedSlots.length ? easternDateKey(new Date(mergedSlots[0].startsAt)) : null
  const futureSlots = mergedSlots.filter((s) =>
    new Date(s.startsAt).getTime() > Date.now() && easternDateKey(new Date(s.startsAt)) === gridDayKey)
  // They are listed again after the day's own times, though, under a divider
  // naming the next day, so someone planning a late night sees 12am to 3am
  // without switching days. Only starts whose whole session fits inside the
  // loaded window are listed; the rest would read as booked when they are not.
  const windowEnd = mergedSlots.length ? new Date(mergedSlots[mergedSlots.length - 1].endsAt).getTime() : 0
  const overnightSlots = mergedSlots.filter((s) =>
    easternDateKey(new Date(s.startsAt)) !== gridDayKey &&
    new Date(s.startsAt).getTime() > Date.now() &&
    new Date(s.startsAt).getTime() + selectedDuration * 60_000 <= windowEnd)
  const firstOpenIdx = [...futureSlots, ...overnightSlots]
    .findIndex((s) => s.available && canFitDurationOnAnyBay(s.startsAt, selectedDuration))
  const visibleSlots = firstOpenIdx === -1 ? [] : [...futureSlots, ...overnightSlots].slice(firstOpenIdx)
  const firstOvernightStart = overnightSlots[0]?.startsAt
  const showStickyBar = step === "time" && !!selectedStart && !!pricingPreview

  function goToReview() {
    setStep("review")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className={["mt-8 space-y-6", showStickyBar ? "pb-24 sm:pb-0" : ""].join(" ")}>
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["date", "time", "review"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-600">›</span>}
            <span className={step === s ? "font-semibold text-brand capitalize" : "text-neutral-500 capitalize"}>
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* ── Unfinished checkout from an earlier visit ── */}
      {unfinishedHold && !reservedBooking && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-white">You have a reservation waiting for payment</p>
          <p className="mt-0.5 text-xs text-neutral-300">
            {unfinishedHold.bayName}, {new Date(unfinishedHold.startsAt).toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              timeZone: "America/Indiana/Indianapolis",
            })} · ${unfinishedHold.total.toFixed(2)}. It is held for 15 minutes from when you started.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => router.push(`/book/complete/${unfinishedHold.id}`)}
              disabled={releasingHold}
              className="btn-primary text-sm px-4 py-2"
            >
              Finish paying
            </button>
            <button
              onClick={async () => {
                setReleasingHold(true)
                try {
                  await cancelReservation(unfinishedHold.id)
                } finally {
                  setReleasingHold(false)
                  setUnfinishedHold(null)
                  if (selectedDate && step === "time") loadAvailability(selectedDate)
                }
              }}
              disabled={releasingHold}
              className="btn-ghost text-sm px-4 py-2"
            >
              {releasingHold ? "Releasing…" : "Release it and start over"}
            </button>
          </div>
        </div>
      )}

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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          {/* Day strip */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {stripDays.map((d) => {
              const isSelected = d.key === selectedKey
              return (
                <button
                  key={d.key}
                  onClick={() => { setRestoreNote(""); selectDate(d.date) }}
                  className={[
                    "flex min-h-[52px] min-w-[64px] shrink-0 flex-col items-center justify-center rounded-xl border px-3 text-sm transition",
                    isSelected
                      ? "border-brand bg-brand/20 text-brand font-semibold"
                      : "border-white/10 text-white hover:border-white/30",
                  ].join(" ")}
                >
                  <span className="text-xs">{d.top}</span>
                  <span>{MONTHS[d.date.getMonth()].slice(0, 3)} {d.date.getDate()}</span>
                </button>
              )
            })}
            <button
              onClick={() => { setRestoreNote(""); setStep("date") }}
              className={[
                "flex min-h-[52px] min-w-[64px] shrink-0 flex-col items-center justify-center rounded-xl border px-3 text-sm transition",
                !selectedInStrip
                  ? "border-brand bg-brand/20 text-brand font-semibold"
                  : "border-white/10 text-neutral-300 hover:border-white/30",
              ].join(" ")}
            >
              <CalendarDays size={16} />
              <span className="text-xs">{selectedInStrip || !selectedDate ? "Other date" : `${MONTHS[selectedDate.getMonth()].slice(0, 3)} ${selectedDate.getDate()}`}</span>
            </button>
          </div>

          <h2 className="mt-4 text-lg font-semibold text-white">
            {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>

          {restoreNote && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {restoreNote}
            </p>
          )}

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
                  {durationLabel(mins)}
                </button>
              ))}
            </div>
          </div>

          {loadingSlots ? (
            <p className="text-sm text-neutral-400">Loading times…</p>
          ) : visibleSlots.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-white">
                No {durationLabel(selectedDuration)} openings left on this day.
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Try a shorter session or another day above.
              </p>
              {nextAvailable && nextAvailable !== "loading" && (
                <button
                  onClick={() => quickBook(nextAvailable)}
                  className="btn-primary mt-3 text-sm px-4 py-2"
                >
                  Next open: {formatNextAvailableDate(nextAvailable.date)} at {nextAvailable.slot.label}
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-neutral-400">
                Pick a start time. Prices are per hour{isAuthenticated ? ", before any discounts" : ""}.
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {visibleSlots.map((slot) => {
                  const canFit = canFitDurationOnAnyBay(slot.startsAt, selectedDuration)
                  const open = slot.available && canFit
                  const isSelected = selectedStart?.startsAt === slot.startsAt
                  return (
                    <Fragment key={slot.startsAt}>
                    {slot.startsAt === firstOvernightStart && (
                      <p className="col-span-full mt-2 border-t border-white/10 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        After midnight, {slotDayLabel(slot.startsAt, "long")}
                      </p>
                    )}
                    <button
                      disabled={!open}
                      onClick={() => {
                        const bay = findBayForSlot(slot.startsAt, selectedDuration)
                        setSelectedStart(slot)
                        setSelectedBay(bay)
                      }}
                      className={[
                        "flex min-h-[52px] flex-col items-center justify-center rounded-lg border py-1.5 text-xs transition",
                        open
                          ? isSelected
                            ? "border-brand bg-brand/20 text-brand font-semibold"
                            : "border-white/10 text-white hover:border-white/30"
                          : "cursor-not-allowed border-white/5 text-neutral-500",
                      ].join(" ")}
                    >
                      <span className={open ? "" : "line-through"}>{slot.label}</span>
                      <span className={["mt-0.5 text-[11px]", open ? (isSelected ? "text-brand" : "text-neutral-400") : "text-neutral-600"].join(" ")}>
                        {open ? `$${slot.pricePerHour}/hr` : "Booked"}
                      </span>
                    </button>
                    </Fragment>
                  )
                })}
              </div>

              {selectedStart && pricingPreview && (
                <div className="mt-5 hidden rounded-xl border border-white/10 bg-black/20 p-4 sm:block">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-neutral-300">
                      <Clock size={14} /> {selectedDuration / 60}hr session starting {slotDayLabel(selectedStart.startsAt, "short")} {selectedStart.label}
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

              {/* On a phone the sticky bar below does this job. */}
              <div className="mt-6 hidden justify-end sm:flex">
                <button
                  disabled={!selectedStart}
                  onClick={goToReview}
                  className="btn-primary"
                >
                  Review booking
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phone: once a time is picked, the summary and the way forward stay on
          screen instead of sitting below a long grid. */}
      {showStickyBar && selectedStart && pricingPreview && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-neutral-950/95 px-4 pt-3 backdrop-blur sm:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {slotDayLabel(selectedStart.startsAt, "short")} {selectedStart.label} · {durationLabel(selectedDuration)}
              </p>
              <p className="text-xs text-neutral-400">${pricingPreview.total.toFixed(2)}</p>
            </div>
            <button onClick={goToReview} className="btn-primary shrink-0 px-5 py-2.5 text-sm">
              Review booking
            </button>
          </div>
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
              <span>{new Date(selectedStart.startsAt).toLocaleDateString("en-US", { timeZone: "America/Indiana/Indianapolis", weekday: "long", month: "short", day: "numeric" })}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Start time</span>
              <span>{new Date(selectedStart.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</span>
            </div>
            <div className="flex justify-between text-neutral-300">
              <span>Duration</span>
              <span>{selectedDuration / 60} hour{selectedDuration > 60 ? "s" : ""}</span>
            </div>
            <div className="flex justify-between border-t border-white/10 pt-2 text-neutral-300">
              <span>Subtotal</span>
              <span>${pricingPreview.subtotal.toFixed(2)}</span>
            </div>
            {pricingPreview.groundsCrewDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Grounds Crew ({pricingPreview.groundsCrewHoursApplied} hr{pricingPreview.groundsCrewHoursApplied !== 1 ? "s" : ""} free)</span>
                <span>−${pricingPreview.groundsCrewDiscount.toFixed(2)}</span>
              </div>
            )}
            {pricingPreview.creditDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Free hours ({pricingPreview.creditHoursApplied} hr{pricingPreview.creditHoursApplied !== 1 ? "s" : ""})</span>
                <span>−${pricingPreview.creditDiscount.toFixed(2)}</span>
              </div>
            )}
            {pricingPreview.membershipDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Member discount</span>
                <span>−${pricingPreview.membershipDiscount.toFixed(2)}</span>
              </div>
            )}
            {pricingPreview.veteranDiscount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Military &amp; veteran discount</span>
                <span>−${pricingPreview.veteranDiscount.toFixed(2)}</span>
              </div>
            )}
            {secondBayPreview && (
              <div className="flex justify-between text-neutral-300">
                <span>Second bay, same time</span>
                <span>+${secondBayPreview.total.toFixed(2)}</span>
              </div>
            )}
          </div>

          {groundsCrewTooEarly && (
            <p className="mt-3 text-xs text-neutral-400">
              Grounds Crew time is free when booked within {GROUNDS_CREW_BOOK_AHEAD_HOURS} hours of the start. Book this one closer to the day and it comes off automatically.
            </p>
          )}

          {/* Add a second bay (lib/bookings/group.ts). Locked once the slot is held. */}
          {twoBayEnabled && !reservedBooking && (
            secondBayOn ? (
              <div className="mt-5 rounded-xl border border-brand bg-brand/10 px-4 py-4">
                <p className="text-sm font-semibold text-white">Second bay added</p>
                <p className="mt-1 text-xs leading-5 text-neutral-300">
                  Same time, side by side whenever two neighboring bays are open. Room for up to 8 players, and one door code gets your whole group in.
                </p>
                <button
                  type="button"
                  onClick={() => setWantSecondBay(false)}
                  className="mt-3 min-h-[44px] rounded-lg border border-white/20 px-4 text-xs font-semibold text-neutral-200 transition hover:bg-white/5"
                >
                  Remove second bay
                </button>
              </div>
            ) : secondBayAvailable ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-sm font-semibold text-white">Bringing more than 4?</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">
                  Each bay fits up to 4 players. Add a second bay for the same time.
                </p>
                <button
                  type="button"
                  onClick={() => setWantSecondBay(true)}
                  className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-brand text-sm font-semibold text-brand transition hover:bg-brand/10"
                >
                  Add a second bay{secondBayQuote ? `, +$${secondBayQuote.total.toFixed(2)}` : ""}
                </button>
              </div>
            ) : twoBayAlternatives.length > 0 && selectedStart ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-sm font-semibold text-white">Bringing more than 4?</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">
                  Only one bay is open at {selectedStart.label}. These times have two bays open:
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {twoBayAlternatives.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => {
                        setSelectedStart(slot)
                        setSelectedBay(findBayForSlot(slot.startsAt, selectedDuration))
                        setWantSecondBay(true)
                      }}
                      className="min-h-[44px] rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white transition hover:border-white/30"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Picking one moves your booking to that time with both bays. Or keep {selectedStart.label} with one bay.
                </p>
              </div>
            ) : null
          )}

          {/* Free hour credits toggle */}
          {availableCreditHours > 0 && (
            <div className="mt-5 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm text-white">
                <input
                  type="checkbox"
                  checked={useFreeHours}
                  onChange={(e) => setUseFreeHours(e.target.checked)}
                  disabled={!!reservedBooking}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 accent-brand"
                />
                Use my free hours ({availableCreditHours} hr{availableCreditHours !== 1 ? "s" : ""} available)
              </label>
            </div>
          )}

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
            {couponCode.trim() && isAuthenticated && !reservedBooking && (
              couponCheck?.code !== couponCode.trim() ? (
                <p className="mt-1 text-xs text-neutral-400">Checking code…</p>
              ) : couponCheck.valid ? (
                <p className="mt-1 text-xs text-green-400">
                  Coupon applied:{" "}
                  {couponCheck.discountType === "percent"
                    ? `${couponCheck.discountValue}% off`
                    : `$${couponCheck.discountValue.toFixed(2)} off`}
                </p>
              ) : (
                <p className="mt-1 text-xs text-red-400">{couponCheck.error}</p>
              )
            )}
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

          {giftCardCode.trim() && !reservedBooking && (
            <p className="mt-3 text-xs text-neutral-400">
              Your gift card balance comes off when you reserve, and the total below updates.
            </p>
          )}

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <span className="font-semibold text-white">Total due</span>
            <span className="text-xl font-bold text-white">${displayTotal.toFixed(2)}</span>
          </div>

          {/* A signed-out member is being quoted list price, which is correct
              for a stranger and understates the deal for a Birdie or Eagle.
              Deliberately says "sign in to see your price" rather than just
              "discounts applied at checkout": for someone who stays signed
              out nothing gets applied, and promising otherwise would be the
              copy telling them a feature works when it does not. */}
          {!isAuthenticated && (
            <p className="mt-2 text-center text-xs text-neutral-400">
              Member discounts apply at checkout.{" "}
              <button
                type="button"
                onClick={() => router.push(signInHref())}
                className="text-brand underline underline-offset-2"
              >
                Sign in
              </button>{" "}
              to see your price.
            </p>
          )}

          {/* Disclosures: the last thing before payment, against a booking
              that already exists. Deliberately not shown pre-reserve - a guest
              would be ticking boxes that get destroyed by the /login redirect,
              and an acknowledgement should attach to a real booking. */}
          {reservedBooking && disclosures.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-medium text-white">
                Please read and acknowledge the following before payment:
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
            <>
              <button
                onClick={handleReserve}
                disabled={reserving || navigatingToBooking}
                className="btn-primary mt-5 w-full"
              >
                {reserving || navigatingToBooking ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    {navigatingToBooking ? "Booked, opening your booking…" : "Reserving slot…"}
                  </span>
                ) : (
                  !isAuthenticated ? "Sign in to reserve" : "Reserve slot"
                )}
              </button>
              {navigatingToBooking && (
                /* The button text alone is easy to miss on a phone, and missing it
                   is exactly what caused the duplicate bookings. */
                <p className="mt-2 text-center text-sm text-brand">
                  Your booking is confirmed. Taking you to it now, no need to book again.
                </p>
              )}
            </>
          )}

          {/* Still waiting on acknowledgement - the payment form is not
              mounted until every disclosure is ticked. */}
          {reservedBooking && !allDisclosuresAcknowledged && (
            <p className="mt-5 text-center text-sm text-neutral-400">
              Acknowledge the {disclosures.length === 1 ? "item" : `${disclosures.length} items`} above to continue to payment.
            </p>
          )}

          {/* Payment form (after slot is reserved AND disclosures acknowledged) */}
          {reservedBooking && allDisclosuresAcknowledged && reservedBooking.clientSecret && (
            <Elements
              key={savedCardsFailed ? "plain" : "saved"}
              stripe={stripePromise}
              options={{
                clientSecret: reservedBooking.clientSecret,
                // Shows the customer's saved cards (lib/payments/saved-cards.ts).
                ...(reservedBooking.customerSessionClientSecret && !savedCardsFailed
                  ? { customerSessionClientSecret: reservedBooking.customerSessionClientSecret }
                  : {}),
                appearance: { theme: "night" },
              }}
            >
              <PaymentForm
                returnUrl={`${window.location.origin}/account/bookings?confirmed=${reservedBooking.id}`}
                total={displayTotal}
                onError={setBookingError}
                onLoadError={
                  reservedBooking.customerSessionClientSecret && !savedCardsFailed
                    ? () => setSavedCardsFailed(true)
                    : undefined
                }
              />
            </Elements>
          )}
        </div>
      )}
    </div>
  )
}
