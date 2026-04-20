// Premium hours: 10am–10pm
const PREMIUM_START_HOUR = 10
const PREMIUM_END_HOUR = 22

// On-season months: October (10) through March (3)
const ON_SEASON_MONTHS = [10, 11, 12, 1, 2, 3]

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

export interface BookingPrice {
  pricePerHour: number
  durationHours: number
  subtotal: number
  membershipDiscount: number
  couponDiscount: number
  giftCardApplied: number
  total: number
  context: PricingContext
}

export function getSeasonType(date: Date): SeasonType {
  const month = date.getMonth() + 1 // 1-indexed
  return ON_SEASON_MONTHS.includes(month) ? "on" : "off"
}

export function getDayType(date: Date): DayType {
  const day = date.getDay() // 0=Sun, 6=Sat
  return day === 0 || day === 6 ? "weekend" : "weekday"
}

export function getTimeType(date: Date): TimeType {
  const hour = date.getHours()
  return hour >= PREMIUM_START_HOUR && hour < PREMIUM_END_HOUR
    ? "premium"
    : "non_premium"
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

  // Gift card applied last
  const giftCardApplied = parseFloat(
    Math.min(giftCardBalance, afterCoupon).toFixed(2)
  )
  const total = parseFloat(Math.max(0, afterCoupon - giftCardApplied).toFixed(2))

  return {
    pricePerHour,
    durationHours,
    subtotal,
    membershipDiscount,
    couponDiscount,
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
 */
export function generateDaySlots(date: Date, extraHours = 4): { startsAt: Date; endsAt: Date; label: string }[] {
  const slots = []
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)

  for (let minutes = 0; minutes < (24 + extraHours) * 60; minutes += 30) {
    const startsAt = new Date(start.getTime() + minutes * 60 * 1000)
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000)
    const hour = startsAt.getHours()
    const min = startsAt.getMinutes()
    const ampm = hour >= 12 ? "pm" : "am"
    const displayHour = hour % 12 === 0 ? 12 : hour % 12
    const displayMin = min === 0 ? "00" : "30"
    slots.push({
      startsAt,
      endsAt,
      label: `${displayHour}:${displayMin}${ampm}`,
    })
  }
  return slots
}
