// Prices an extension of an active booking: card, hour credits, gift card.
// Shared by /api/bookings/extend (shows the price, makes the PaymentIntent)
// and finalizeFreeExtend (applies a fully covered extension), so the server
// always re-prices on its own and never trusts the client's numbers.
import { createClient } from "@/lib/supabase/server"
import { calculateBookingPrice, getPricingContext, type BookingPrice } from "@/lib/pricing/engine"
import { getVeteranDiscountPercent } from "@/lib/pricing/veteran"
import { isInFirstYear } from "@/lib/membership/first-year"
import { holdsBayFilter } from "@/lib/bookings/pending-hold"
import { getAvailableHourCredits, sumCreditHours } from "@/lib/hour-credits"
import { easternDateKey } from "@/lib/time/eastern"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any

// Available extension lengths offered on the extend page, capped by whatever
// room is actually free on the bay before the next booking/block.
export const EXTEND_OPTIONS_MINUTES = [30, 60]

// Stripe will not charge less than this.
const STRIPE_MIN_CHARGE = 0.5

export type ExtendQuote =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      booking: { id: string; user_id: string; ends_at: string }
      // Signed in on this device as the booking's owner. Only then may the
      // owner's hour credits or saved cards be used: anyone in the group can
      // open the QR/SMS extend link.
      isOwnerSession: boolean
      // The owner has hour credits but this device is not signed in as them.
      // The page can then say "sign in to use your pack hours".
      creditsNeedSignIn: boolean
      newEndsAt: string
      extendMinutes: number
      pricePerHour: number
      pricing: BookingPrice
      creditHours: number
      giftCardId: string | null
      giftCardApplied: number
      netCharge: number
    }

export async function quoteExtension(
  serviceClient: ServiceClient,
  { bookingId, token, extendMinutes, giftCardCode }: {
    bookingId: string
    token?: string
    extendMinutes: number
    giftCardCode?: string
  },
): Promise<ExtendQuote> {
  if (!EXTEND_OPTIONS_MINUTES.includes(extendMinutes)) {
    return { ok: false, status: 400, error: "Invalid extension length" }
  }

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, bay_id, status, ends_at, extend_token")
    .eq("id", bookingId)
    .single()
  if (!booking) return { ok: false, status: 404, error: "Booking not found" }

  // Accept either the QR/SMS extend token (phone has no session mid-round)
  // or a logged-in session matching the booking's owner.
  const supabase = await createClient()
  const { data: { user: sessionUser } } = await supabase.auth.getUser()
  const isOwnerSession = Boolean(sessionUser && sessionUser.id === booking.user_id)
  const tokenOk = Boolean(token && booking.extend_token && token === booking.extend_token)
  if (!tokenOk && !isOwnerSession) return { ok: false, status: 401, error: "Unauthorized" }

  if (booking.status !== "confirmed") {
    return { ok: false, status: 400, error: "Only active bookings can be extended" }
  }

  const currentEnd = new Date(booking.ends_at)
  const now = new Date()
  if (currentEnd <= now) return { ok: false, status: 400, error: "This session has already ended" }

  const newEnd = new Date(currentEnd.getTime() + extendMinutes * 60 * 1000)

  const [{ data: conflicts }, { data: blocked }] = await Promise.all([
    serviceClient.from("bookings").select("id")
      .eq("bay_id", booking.bay_id).or(holdsBayFilter())
      .neq("id", bookingId)
      .lt("starts_at", newEnd.toISOString()).gt("ends_at", currentEnd.toISOString()),
    serviceClient.from("blocked_times").select("id")
      .or(`bay_id.eq.${booking.bay_id},bay_id.is.null`)
      .lt("starts_at", newEnd.toISOString()).gt("ends_at", currentEnd.toISOString()),
  ])
  if (conflicts?.length || blocked?.length) {
    return { ok: false, status: 409, error: "The next booking on this bay doesn't leave room to extend by that much" }
  }

  // Pricing rules + the booking owner's current membership discount, same
  // inputs reschedule uses, sourced via booking.user_id since we may not have
  // a session (token-authorized phone request).
  const { data: pricingRules } = await serviceClient
    .from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")
  const rulesMap: Record<string, number> = {}
  for (const rule of (pricingRules ?? []) as { season_type: string; day_type: string; time_type: string; price_per_hour: number }[]) {
    rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
  }

  // Priced at the current moment's rate (extension time is now, not the
  // original booking's slot), same convention as reschedule pricing the new slot.
  const context = getPricingContext(now)
  const pricePerHour = rulesMap[`${context.seasonType}|${context.dayType}|${context.timeType}`] ?? 0

  const { data: membership } = await serviceClient
    .from("memberships")
    .select("started_at, year_one_discount_expires_at, membership_plans(discount_percent, first_year_discount)")
    .eq("user_id", booking.user_id).eq("status", "active").single()

  let membershipDiscountPercent = 0
  if (membership) {
    const plan = membership.membership_plans as { discount_percent: number; first_year_discount: number | null } | null
    if (plan) {
      const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null })
      membershipDiscountPercent =
        isFirstYear && plan.first_year_discount != null ? plan.first_year_discount : plan.discount_percent
    }
  }

  // Keyed on booking.user_id rather than the caller, because a bay agent can
  // trigger an extension on the customer's behalf and must not quietly charge
  // them full price.
  const veteranDiscountPercent = await getVeteranDiscountPercent(serviceClient, booking.user_id)

  // Hour credits (packs, Eagle hours, bonuses all live in hour_credits).
  // Used automatically, but only for the signed-in owner.
  let creditHours = 0
  let creditsNeedSignIn = false
  {
    const credits = await getAvailableHourCredits(serviceClient, booking.user_id)
    const available = sumCreditHours(credits)
    if (available > 0) {
      if (isOwnerSession) creditHours = Math.min(available, extendMinutes / 60)
      else creditsNeedSignIn = true
    }
  }

  // Gift card: same checks as booking checkout (lib/bookings/create.ts),
  // judged against the extension time, which is now.
  let giftCardId: string | null = null
  let giftCardBalance = 0
  if (giftCardCode && giftCardCode.trim()) {
    const normalized = giftCardCode.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
    const { data: giftCard } = await serviceClient
      .from("gift_cards")
      .select("id, balance, expires_at, valid_from, days_allowed")
      .eq("code", normalized)
      .eq("active", true)
      .single()
    if (!giftCard) return { ok: false, status: 400, error: "Invalid gift card code" }
    const gc = giftCard as { id: string; balance: number; expires_at: string | null; valid_from: string | null; days_allowed: number[] | null }
    const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
    if (gc.expires_at && new Date(gc.expires_at) <= now) return { ok: false, status: 400, error: "Gift card has expired" }
    if (Number(gc.balance) <= 0) return { ok: false, status: 400, error: "Gift card has no remaining balance" }
    if (gc.valid_from && now < new Date(gc.valid_from)) {
      return { ok: false, status: 400, error: `This gift card is good for sessions starting ${dayLabel(new Date(gc.valid_from))}.` }
    }
    if (gc.days_allowed?.length) {
      const dow = new Date(`${easternDateKey(now)}T12:00:00Z`).getUTCDay()
      if (!gc.days_allowed.includes(dow)) {
        const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        return { ok: false, status: 400, error: `This gift card works on ${gc.days_allowed.map((d) => names[d]).join(", ")} sessions only.` }
      }
    }
    giftCardId = gc.id
    giftCardBalance = Number(gc.balance)
  }

  const pricing = calculateBookingPrice({
    pricePerHour, durationMinutes: extendMinutes, membershipDiscountPercent, context,
    veteranDiscountPercent, creditHours, giftCardBalance,
  })

  let giftCardApplied = pricing.giftCardApplied
  let netCharge = pricing.total

  // A gift card can leave a few cents Stripe cannot charge. Use a little
  // less of the card so the remainder is chargeable.
  if (netCharge > 0 && netCharge < STRIPE_MIN_CHARGE && giftCardApplied > 0) {
    const shift = parseFloat((STRIPE_MIN_CHARGE - netCharge).toFixed(2))
    giftCardApplied = parseFloat(Math.max(0, giftCardApplied - shift).toFixed(2))
    netCharge = STRIPE_MIN_CHARGE
  }
  if (giftCardApplied <= 0) giftCardId = null

  // Still unchargeable with nothing covering it: pricing is broken.
  if (netCharge > 0 && netCharge < STRIPE_MIN_CHARGE) {
    return { ok: false, status: 400, error: "Something went wrong calculating the price. Please contact us at info@tee365.org." }
  }
  // A $0 extension must come from credits or a gift card, never from a
  // missing price rule.
  if (netCharge === 0 && pricing.creditHoursApplied === 0 && giftCardApplied === 0) {
    return { ok: false, status: 400, error: "Something went wrong calculating the price. Please contact us at info@tee365.org." }
  }

  return {
    ok: true,
    booking: { id: booking.id, user_id: booking.user_id, ends_at: booking.ends_at },
    isOwnerSession,
    creditsNeedSignIn,
    newEndsAt: newEnd.toISOString(),
    extendMinutes,
    pricePerHour,
    pricing: { ...pricing, giftCardApplied, total: netCharge },
    creditHours: pricing.creditHoursApplied,
    giftCardId,
    giftCardApplied,
    netCharge,
  }
}
