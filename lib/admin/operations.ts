/**
 * Operational stats (bookings count, avg $, utilization) for the admin dashboard.
 *
 * Mirrors the same "week" (rolling 7 days through now) and "month" (MTD)
 * windows used by lib/admin/revenue.ts's Sales card, so the two cards read
 * consistently side by side.
 */

import { computePeriodBoundaries } from "@/lib/admin/revenue"

export type OperationsStats = {
  bookingsWeek: number
  bookingsMonth: number
  avgDollarPerBooking: number // month-to-date, paid bookings only (excludes $0 hour-credit bookings)
  utilizationWeek: number      // 0-100, against capacity for the time actually elapsed
  utilizationMonth: number     // 0-100, against capacity for the time actually elapsed
  utilizationMonthTotal: number // 0-100, against the WHOLE month's capacity
  daysInMonth: number
}

const BAY_HOURS_PER_DAY = 96 // 4 bays x 24 hours

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeOperationsStats(serviceClient: any): Promise<OperationsStats> {
  const { weekStart, monthStart } = computePeriodBoundaries()
  const now = new Date()

  // End of the current Indiana month, by the same offset trick
  // computePeriodBoundaries uses, plus how many days that month has.
  const nowET = new Date(now.toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" }))
  const etOffset = now.getTime() - nowET.getTime()
  const monthEndET = new Date(nowET.getFullYear(), nowET.getMonth() + 1, 1)
  const monthEnd = new Date(monthEndET.getTime() + etOffset)
  const daysInMonth = new Date(nowET.getFullYear(), nowET.getMonth() + 1, 0).getDate()

  // Most of the month, monthStart is well before weekStart (e.g. day 20 of
  // a 30-day month) - query from whichever boundary is earlier so the
  // month bucket below isn't silently missing its first ~3 weeks.
  const queryStart = weekStart < monthStart ? weekStart : monthStart

  // Deliberately queried through the END of the month, not through now: the
  // month-total figure counts time already on the books for later this month,
  // which is what makes it answer "how full is this month" rather than just
  // repeating month-to-date against a bigger denominator.
  const { data: bookings } = await serviceClient
    .from("bookings")
    .select("starts_at, ends_at, total")
    .eq("status", "confirmed")
    .gte("starts_at", queryStart.toISOString())
    .lt("starts_at", monthEnd.toISOString())

  const rows = (bookings ?? []) as Array<{ starts_at: string; ends_at: string; total: number }>

  let bookingsWeek = 0
  let bookingsMonth = 0
  let hoursWeek = 0
  let hoursMonth = 0
  let hoursMonthTotal = 0
  let monthDollarSum = 0
  let monthPaidBookings = 0 // total > 0 only - excludes hour-credit-covered ($0) bookings from the avg

  for (const b of rows) {
    const startsAt = new Date(b.starts_at)
    const hours = (new Date(b.ends_at).getTime() - startsAt.getTime()) / (1000 * 60 * 60)
    const started = startsAt < now

    if (started && startsAt >= weekStart) {
      bookingsWeek += 1
      hoursWeek += hours
    }

    if (startsAt >= monthStart) {
      // Everything this month counts toward the total, including what has not
      // happened yet.
      hoursMonthTotal += hours

      if (started) {
        bookingsMonth += 1
        hoursMonth += hours
        const total = Number(b.total)
        if (total > 0) {
          monthDollarSum += total
          monthPaidBookings += 1
        }
      }
    }
  }

  // Pace-adjusted: capacity is 96 hrs/day x the time actually elapsed, not the
  // full window length, otherwise a to-date figure reads artificially low
  // early on. The week half of this used a flat 7 days while its window only
  // runs from midnight six days ago through now, so it understated by up to a
  // full day's capacity depending on the time of day - fixed 2026-09-12 when
  // the labels became explicit about being to-date.
  const elapsedDaysInWeek = (now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
  const elapsedDaysInMonth = (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)

  const pct = (hours: number, days: number) =>
    days > 0 ? (hours / (BAY_HOURS_PER_DAY * days)) * 100 : 0

  return {
    bookingsWeek,
    bookingsMonth,
    avgDollarPerBooking: monthPaidBookings > 0 ? monthDollarSum / monthPaidBookings : 0,
    utilizationWeek: pct(hoursWeek, elapsedDaysInWeek),
    utilizationMonth: pct(hoursMonth, elapsedDaysInMonth),
    utilizationMonthTotal: pct(hoursMonthTotal, daysInMonth),
    daysInMonth,
  }
}
