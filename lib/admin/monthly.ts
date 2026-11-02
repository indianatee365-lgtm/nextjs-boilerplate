/**
 * Month-by-month business numbers for /admin/sales: revenue by source plus
 * the operating figures behind it (sessions, bay hours, utilization, customers).
 *
 * Revenue comes from the same collector as the period cards
 * (collectRevenueEvents), so a month here always matches what "Last month"
 * says on the card above it.
 */

import { addDaysToDateKey, easternDateKey, easternMidnightUtc } from "@/lib/time/eastern"
import {
  collectRevenueEvents, fetchAllRows, shiftMonthKey, sumInRange,
  REVENUE_SOURCE_ORDER, type RevenueSource,
} from "@/lib/admin/revenue"

const TZ = "America/Indiana/Indianapolis"
const BAY_HOURS_PER_DAY = 96 // 4 bays x 24 hours, same as lib/admin/operations.ts

// Founder memberships were sold from May 2026, before the bays opened on
// Founders Day (Aug 29). History starts at the first month with any revenue,
// looking no further back than the year the business started.
const DATA_FLOOR = "2026-01-01"
const OPENING_DAY = "2026-08-29"

export type MonthRow = {
  key: string            // "2026-10-01"
  label: string          // "Oct 2026"
  partial: boolean       // the current month, still in progress
  revenue: Record<RevenueSource, number>
  total: number
  sessions: number       // bookings that were played (not cancelled, not admin tests)
  bayHours: number
  utilization: number | null // 0-100, of 24/7 capacity over the days covered; null before opening
  revenuePerBayHour: number
  avgBooking: number     // cash per paid booking
  customers: number      // distinct people who played
  newCustomers: number   // played for the first time this month
  discounts: number      // member, coupon, promo, veteran, credit and Grounds Crew discounts given
  cancellations: number
  refunds: number        // already netted out of revenue; shown so it is visible
}

export type Daypart = "morning" | "afternoon" | "evening" | "late"

export const DAYPARTS: { key: Daypart; label: string }[] = [
  { key: "morning", label: "Before noon" },
  { key: "afternoon", label: "Noon to 5" },
  { key: "evening", label: "5 to 9" },
  { key: "late", label: "After 9" },
]

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export type SalesInsights = {
  months: MonthRow[]                  // newest first
  busiest: { weeks: number; hours: number[][]; revenue: number[] } // hours[weekday][daypart], Mon first
  customersAllTime: number
  repeatRate: number                  // 0-100, share of customers who have played more than once
  giftCardBalance: number             // unspent balance on paid gift cards
  compGiftCardBalance: number         // unspent balance on admin-issued cards
  creditHoursOutstanding: number      // unused free hours not yet expired
  projectedMonth: number | null       // this month's revenue at the current daily pace
}

type BookingRow = {
  user_id: string | null
  starts_at: string
  ends_at: string
  status: string
  source: string | null
  total: number
  gift_card_applied: number | null
  refund_amount: number | null
  paid_at: string | null
  cancelled_at: string | null
  membership_discount: number | null
  coupon_discount: number | null
  promo_discount: number | null
  veteran_discount: number | null
  credit_discount: number | null
  grounds_crew_discount: number | null
}

function localParts(d: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", hour: "2-digit", hour12: false,
  }).formatToParts(d)
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24
  return { weekday: WEEKDAYS.indexOf(wd), hour }
}

function daypartIndex(hour: number): number {
  if (hour < 12) return 0
  if (hour < 17) return 1
  if (hour < 21) return 2
  return 3
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeSalesInsights(serviceClient: any, now: Date = new Date()): Promise<SalesInsights> {
  const todayKey = easternDateKey(now)
  const currentMonthKey = `${todayKey.slice(0, 8)}01`
  const firstMonthStart = easternMidnightUtc(DATA_FLOOR)

  const [events, bookings, giftCards, credits] = await Promise.all([
    collectRevenueEvents(serviceClient, firstMonthStart),
    // All bookings ever, not just this window: "new customer" needs to know
    // whether someone had played before.
    fetchAllRows<BookingRow>(() =>
      serviceClient
        .from("bookings")
        .select(`user_id, starts_at, ends_at, status, source, total, gift_card_applied, refund_amount,
          paid_at, cancelled_at, membership_discount, coupon_discount, promo_discount, veteran_discount,
          credit_discount, grounds_crew_discount`)
        .order("starts_at")),
    fetchAllRows<{ balance: number; stripe_payment_id: string | null; active: boolean | null; expires_at: string | null }>(() =>
      serviceClient.from("gift_cards").select("balance, stripe_payment_id, active, expires_at").gt("balance", 0).order("created_at")),
    fetchAllRows<{ hours_remaining: number; active: boolean | null; expires_at: string | null }>(() =>
      serviceClient.from("hour_credits").select("hours_remaining, active, expires_at").gt("hours_remaining", 0).order("created_at")),
  ])

  // Played = confirmed, already started, and not an admin test booking.
  const played = bookings.filter((b) =>
    b.status === "confirmed" && b.source !== "admin" && new Date(b.starts_at) <= now)

  const firstPlayed = new Map<string, number>()
  const playCount = new Map<string, number>()
  for (const b of played) {
    if (!b.user_id) continue
    const t = new Date(b.starts_at).getTime()
    if (!firstPlayed.has(b.user_id) || t < firstPlayed.get(b.user_id)!) firstPlayed.set(b.user_id, t)
    playCount.set(b.user_id, (playCount.get(b.user_id) ?? 0) + 1)
  }

  const months: MonthRow[] = []
  for (let key = DATA_FLOOR; key <= currentMonthKey; key = shiftMonthKey(key, 1)) {
    const start = easternMidnightUtc(key)
    const nextStart = easternMidnightUtc(shiftMonthKey(key, 1))
    const partial = key === currentMonthKey
    const end = partial ? now : nextStart
    const range = { start, end }
    const inMonth = (iso: string | null) => {
      if (!iso) return false
      const t = new Date(iso)
      return t >= start && t < end
    }

    const revenue = {} as Record<RevenueSource, number>
    for (const s of REVENUE_SOURCE_ORDER) revenue[s] = sumInRange(events, range, s)
    const total = sumInRange(events, range)

    const monthPlayed = played.filter((b) => inMonth(b.starts_at))
    const bayHours = monthPlayed.reduce((h, b) =>
      h + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3_600_000, 0)
    const people = new Set(monthPlayed.map((b) => b.user_id).filter((u): u is string => !!u))
    const newCustomers = [...people].filter((u) => {
      const t = firstPlayed.get(u)
      return t !== undefined && t >= start.getTime() && t < end.getTime()
    }).length

    const paidInMonth = bookings.filter((b) => inMonth(b.paid_at))
    const cashBookings = paidInMonth
      .map((b) => Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0))
      .filter((c) => c > 0)
    const discounts = monthPlayed.reduce((d, b) =>
      d + Number(b.membership_discount ?? 0) + Number(b.coupon_discount ?? 0) + Number(b.promo_discount ?? 0)
        + Number(b.veteran_discount ?? 0) + Number(b.credit_discount ?? 0) + Number(b.grounds_crew_discount ?? 0), 0)
    const cancelled = bookings.filter((b) => b.status === "cancelled" && b.source !== "admin" && inMonth(b.cancelled_at))

    // Utilization counts from opening day in the opening month, only the days
    // elapsed so far in the current one, and not at all before the bays opened.
    const opening = easternMidnightUtc(OPENING_DAY)
    const capacityStart = start < opening ? opening : start
    const days = Math.max((end.getTime() - capacityStart.getTime()) / 86_400_000, 0)
    const bayRevenue = revenue.bookings + revenue.extensions

    months.push({
      key,
      label: new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      partial,
      revenue,
      total,
      sessions: monthPlayed.length,
      bayHours: Math.round(bayHours * 10) / 10,
      utilization: days > 0 ? (bayHours / (BAY_HOURS_PER_DAY * days)) * 100 : null,
      revenuePerBayHour: bayHours > 0 ? bayRevenue / bayHours : 0,
      avgBooking: cashBookings.length ? cashBookings.reduce((a, c) => a + c, 0) / cashBookings.length : 0,
      customers: people.size,
      newCustomers,
      discounts: Math.round(discounts * 100) / 100,
      cancellations: cancelled.length,
      refunds: Math.round(cancelled.reduce((r, b) => r + Number(b.refund_amount ?? 0), 0) * 100) / 100,
    })
  }
  // Drop the empty months before the first sale.
  while (months.length > 1 && months[0].total === 0 && months[0].sessions === 0) months.shift()
  months.reverse()

  // Busiest times: the last 8 full weeks (Mon to Sun), averaged per week.
  const weeks = 8
  const todayWeekday = localParts(now).weekday
  const thisMonday = addDaysToDateKey(todayKey, -todayWeekday)
  const busyStart = easternMidnightUtc(addDaysToDateKey(thisMonday, -7 * weeks))
  const busyEnd = easternMidnightUtc(thisMonday)
  const hours = WEEKDAYS.map(() => DAYPARTS.map(() => 0))
  const revenueByDay = WEEKDAYS.map(() => 0)
  for (const b of played) {
    const s = new Date(b.starts_at)
    if (s < busyStart || s >= busyEnd) continue
    const { weekday, hour } = localParts(s)
    if (weekday < 0) continue
    hours[weekday][daypartIndex(hour)] += (new Date(b.ends_at).getTime() - s.getTime()) / 3_600_000 / weeks
    revenueByDay[weekday] += Math.max(Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0), 0) / weeks
  }

  const notExpired = (r: { active: boolean | null; expires_at: string | null }) =>
    r.active !== false && (!r.expires_at || new Date(r.expires_at) > now)

  const current = months[0]
  const monthStart = easternMidnightUtc(currentMonthKey)
  const daysElapsed = (now.getTime() - monthStart.getTime()) / 86_400_000
  const daysInMonth = (easternMidnightUtc(shiftMonthKey(currentMonthKey, 1)).getTime() - monthStart.getTime()) / 86_400_000

  return {
    months,
    busiest: { weeks, hours, revenue: revenueByDay },
    customersAllTime: playCount.size,
    repeatRate: playCount.size ? ([...playCount.values()].filter((n) => n > 1).length / playCount.size) * 100 : 0,
    giftCardBalance: giftCards.filter((g) => g.stripe_payment_id && notExpired(g)).reduce((t, g) => t + Number(g.balance), 0),
    compGiftCardBalance: giftCards.filter((g) => !g.stripe_payment_id && notExpired(g)).reduce((t, g) => t + Number(g.balance), 0),
    creditHoursOutstanding: credits.filter(notExpired).reduce((t, c) => t + Number(c.hours_remaining), 0),
    // Too noisy to project in the first few days of a month.
    projectedMonth: current && daysElapsed >= 5 ? (current.total / daysElapsed) * daysInMonth : null,
  }
}
