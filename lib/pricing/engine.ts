// Premium hours: 4pm to 10pm inclusive, so the last premium start is 10:00pm.
//
// Was 10am to 10pm until 2026-10-03. Six weeks of real bookings showed demand is
// an afternoon and evening business: 4pm through 9pm is the spine (hour 19 alone
// was 14 bookings and 27 hours), while 10am through 2pm barely sells and was
// being charged the peak rate the whole time. Narrowing the window cuts the
// daytime price without touching evening revenue, which is a far better targeted
// discount than taking money off every hour of the day.
//
// Exported so anything that DISPLAYS the window reads it from here rather than
// restating it. The admin pricing page got this wrong within a day of being
// written, which is the whole argument for exporting it.
export const PREMIUM_START_HOUR = 16
// End is EXCLUSIVE, so 23 means a 10:00pm start is premium and 11:00pm is not.
// Deliberate, 2026-10-03: the 10pm hour sells better than two hours already
// inside premium (7 bookings and 14.5 hours, against 9pm at 7/9.3 and 4pm at
// 13/20) and it is the one slot with no competition at any temperature, because
// no outdoor course is open then. It was in the bargain bin. 11pm onward stays
// cheap on purpose, as a night-owl rate worth marketing.
export const PREMIUM_END_HOUR = 23

// On-season months: October (10) through March (3)
export const ON_SEASON_MONTHS = [10, 11, 12, 1, 2, 3]

// Business timezone: all slot labels and pricing context use local time, not UTC
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

// Veteran discount, 10% off bay time, set 2026-10-04.
//
// Stacks sequentially with everything else, which is the rule the rest of this
// function already follows (Jerrod's call 2026-09-11: a 20% sale plus a 20%
// member rate is 36% off, not 40%). So a founder on 30% who is also a veteran
// pays 37% less, not 40% less. Exported so the marketing copy and the admin
// screens quote the same number this function charges.
export const VETERAN_DISCOUNT_PERCENT = 10

// Tax disabled per Indiana DOR ruling 2026-05-30: no sales tax on hourly bay rental, memberships, or gift cards.
// Keep the constant and the engine logic intact so tax can be re-enabled by changing this one line if the ruling ever shifts.
export const TAX_RATE = 0

export interface BookingPrice {
  pricePerHour: number
  durationHours: number
  subtotal: number
  groundsCrewHoursApplied: number
  groundsCrewDiscount: number
  creditHoursApplied: number
  creditDiscount: number
  promoDiscount: number
  membershipDiscount: number
  veteranDiscount: number
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
  promoDiscountPercent = 0,
  veteranDiscountPercent = 0,
  couponDiscountType,
  couponDiscountValue = 0,
  giftCardBalance = 0,
  creditHours = 0,
  groundsCrewHours = 0,
  context,
}: {
  pricePerHour: number
  durationMinutes: number
  membershipDiscountPercent?: number
  promoDiscountPercent?: number
  veteranDiscountPercent?: number
  couponDiscountType?: "percent" | "fixed"
  couponDiscountValue?: number
  giftCardBalance?: number
  creditHours?: number
  groundsCrewHours?: number
  context: PricingContext
}): BookingPrice {
  const durationHours = durationMinutes / 60
  const subtotal = parseFloat((pricePerHour * durationHours).toFixed(2))

  // Grounds Crew hours (the Albatross perk, lib/membership/grounds-crew.ts)
  // come off the top first, at the slot's rate. Hour credits then cover only
  // what is left, so nobody spends a credit on time that was already free.
  // With groundsCrewHours at 0, which is every booking outside Albatross,
  // every line below works out exactly as it did before this existed.
  const groundsCrewHoursApplied = Math.min(groundsCrewHours, durationHours)
  const groundsCrewDiscount = parseFloat(
    Math.min(pricePerHour * groundsCrewHoursApplied, subtotal).toFixed(2)
  )

  // Hour credits come off the top: they reduce billable time at the slot's rate,
  // so all percentage discounts below only apply to hours actually being paid for.
  const creditHoursApplied = Math.min(creditHours, durationHours - groundsCrewHoursApplied)
  const creditDiscount = parseFloat(
    Math.min(pricePerHour * creditHoursApplied, subtotal - groundsCrewDiscount).toFixed(2)
  )
  const afterCredits = subtotal - groundsCrewDiscount - creditDiscount

  // Site-wide sale (admin-controlled, see /admin/discounts) comes off before
  // the membership discount, so the two stack sequentially rather than being
  // added together: a 20% sale plus a 20% member rate is 36% off, not 40%.
  // Jerrod's call 2026-09-11, matching how membership and coupons already
  // compound in this same chain.
  const promoDiscount = parseFloat(
    ((afterCredits * promoDiscountPercent) / 100).toFixed(2)
  )
  const afterPromo = afterCredits - promoDiscount

  // Membership discount applied next
  const membershipDiscount = parseFloat(
    ((afterPromo * membershipDiscountPercent) / 100).toFixed(2)
  )
  const afterMembership = afterPromo - membershipDiscount

  // Veteran discount, same sequential compounding as everything above it.
  // Percentage stages are order independent, so this sits after membership for
  // readability rather than for arithmetic: only the fixed-amount coupon below
  // cares where it lands in the chain.
  const veteranDiscount = parseFloat(
    ((afterMembership * veteranDiscountPercent) / 100).toFixed(2)
  )
  const afterVeteran = afterMembership - veteranDiscount

  // Coupon discount applied last of the percentage stages
  let couponDiscount = 0
  if (couponDiscountType === "percent") {
    couponDiscount = parseFloat(
      ((afterVeteran * couponDiscountValue) / 100).toFixed(2)
    )
  } else if (couponDiscountType === "fixed") {
    couponDiscount = Math.min(couponDiscountValue, afterVeteran)
  }
  const afterCoupon = afterVeteran - couponDiscount

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
    groundsCrewHoursApplied,
    groundsCrewDiscount,
    creditHoursApplied,
    creditDiscount,
    promoDiscount,
    membershipDiscount,
    veteranDiscount,
    couponDiscount,
    taxableAmount,
    tax,
    giftCardApplied,
    total,
    context,
  }
}

/**
 * Generate all 30-min slots for a given date.
 * Returns slots as { startsAt, endsAt, label } for UI display.
 * Labels are formatted in the business timezone so they match what customers see locally.
 */
export function generateDaySlots(date: Date, extraHours = 4): { startsAt: Date; endsAt: Date; label: string }[] {
  const slots = []
  // Use the date as-is, callers pass local midnight expressed in UTC,
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
