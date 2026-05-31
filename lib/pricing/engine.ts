// Premium hours: 10am–10pm
const PREMIUM_START_HOUR = 10
const PREMIUM_END_HOUR = 22

// On-season months: October (10) through March (3)
const ON_SEASON_MONTHS = [10, 11, 12, 1, 2, 3]

// Business timezone — all slot labels and pricing context use local time, not UTC
const BUSINESS_TZ = "America/Indiana/Indianapolis"

function localParts(date: Date): { hour: number; weekday: number; month: number } {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, hour: "2-digit", hour12: false }).format(date)
  ) % 24
  const weekdayStr = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, weekday: "short" }).format(date)
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr)
  const month = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, month: "numeric" }).format(date)
  )
  return { hour, weekday, month }
}

export type SeasonType = "on" | "off"
export type DayType = "weekday" | "weekend"
export type TimeType = "premium" | "non_premium"

export interface PricingContext {
  seasonType: SeasonType
  dayType: DayType
  timeType: TimeType
}

export interface SlotPrice {
  pricePerHour: number
  context: PricingContext
}

// Tax disabled per Indiana DOR ruling 2026-05-30: no sales tax on hourly bay rental, memberships, or gift cards.
// Keep the constant and the engine logic intact so tax can be re-enabled by changing this one line if the ruling ever shifts.
export const TAX_RATE = 0

export interface BookingPrice {
  pricePerHour: number
  durationHours: number
  subtotal: number
  membershipDiscount: number
  couponDiscount: number
  taxableAmount: number
  tax: number
  giftCardApplied: number
  total: number
  context: PricingContext
}

export function getSeasonType(date: Date): SeasonType {
  const { month } = localParts(date)
  return ON_SEASON_MONTHS.includes(month) ? "on" : "off"
}

export function getDayType(date: Date): DayType {
  const { weekday } = localParts(date)
  return weekday === 0 || weekday === 6 ? "weekend" : "weekday"
}

export function getTimeType(date: Date): TimeType {
  const { hour } = localParts(date)
  return hour >= PREMIUM_START_HOUR && hour < PREMIUM_END_HOUR ? "premium" : "non_premium"
}

export function getPricingContext(date: Date): PricingContext {
  return {
    seasonType: getSeasonType(date),
    dayType: getDayType(date),
    timeType: getTimeType(date),
  }
}

/**
 * Given a pricing rules map and a start time, return the price per hour.
 * pricingRules is keyed as "season_type|day_type|time_type"
 */
export function getPricePerHour(
  pricingRules: Record<string, number>,
  startsAt: Date
): SlotPrice {
  const context = getPricingContext(startsAt)
  const key = `${context.seasonType}|${context.dayType}|${context.timeType}`
  const pricePerHour = pricingRules[key] ?? 0
  return { pricePerHour, context }
}

/**
 * Calculate the full booking price including all discounts.
 */
export function calculateBookingPrice({
  pricePerHour,
  durationMinutes,
  membershipDiscountPercent = 0,
  couponDiscountType,
  couponDiscountValue = 0,
  giftCardBalance = 0,
  context,
}: {
  pricePerHour: number
  durationMinutes: number
  membershipDiscountPercent?: number
  couponDiscountType?: "percent" | "fixed"
  couponDiscountValue?: number
  giftCardBalance?: number
  context: PricingContext
}): BookingPrice {
  const durationHours = durationMinutes / 60
  const subtotal = parseFloat((pricePerHour * durationHours).toFixed(2))

  // Membership discount applied first
  const membershipDiscount = parseFloat(
    ((subtotal * membershipDiscountPercent) / 100).toFixed(2)
  )
  const afterMembership = subtotal - membershipDiscount

  // Coupon discount applied after membership
  let couponDiscount = 0
  if (couponDiscountType === "percent") {
    couponDiscount = parseFloat(
      ((afterMembership * couponDiscountValue) / 100).toFixed(2)
    )
  } else if (couponDiscountType === "fixed") {
    couponDiscount = Math.min(couponDiscountValue, afterMembership)
  }
  const afterCoupon = afterMembership - couponDiscount

  // Tax applies on the discounted amount, before gift card (gift card is a payment method)
  const taxableAmount = parseFloat(afterCoupon.toFixed(2))
  const tax = parseFloat((taxableAmount * TAX_RATE).toFixed(2))
  const afterTax = taxableAmount + tax

  // Gift card applied last, against the full amount including tax
  const giftCardApplied = parseFloat(
    Math.min(giftCardBalance, afterTax).toFixed(2)
  )
  const total = parseFloat(Math.max(0, afterTax - giftCardApplied).toFixed(2))

  return {
    pricePerHour,
    durationHours,
    subtotal,
    membershipDiscount,
    couponDiscount,
    taxableAmount,
    tax,
    giftCardApplied,
    total,
    context,
  }
}

/**
 * Returns the max days in advance a user can book based on their membership.
 */
export function getAdvanceBookingDays(membershipSlug: string | null): number {
  switch (membershipSlug) {
    case "founders": return 21
    case "eagle":
    case "birdie":   return 14
    default:         return 7
  }
}

/**
 * Returns the furthest date a user can book.
 */
export function getMaxBookingDate(membershipSlug: string | null): Date {
  const days = getAdvanceBookingDays(membershipSlug)
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 59, 999)
  return date
}

/**
 * Generate all 30-min slots for a given date.
 * Returns slots as { startsAt, endsAt, label } for UI display.
 * Labels are formatted in the business timezone so they match what customers see locally.
 */
export function generateDaySlots(date: Date, extraHours = 4): { startsAt: Date; endsAt: Date; label: string }[] {
  const slots = []
  // Use the date as-is — callers pass local midnight expressed in UTC,
  // so resetting hours here would snap to UTC midnight and lose the offset.
  const start = new Date(date)
  const labelFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  for (let minutes = 0; minutes < (24 + extraHours) * 60; minutes += 30) {
    const startsAt = new Date(start.getTime() + minutes * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000)
    // Replace narrow no-break space (U+202F) that some environments emit between time and AM/PM
    const label = labelFmt.format(startsAt).replace(/ |\s/g, "").toLowerCase()
    slots.push({ startsAt, endsAt, label })
  }
  return slots
}
