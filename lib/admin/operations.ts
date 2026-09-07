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
  utilizationWeek: number   // 0-100
  utilizationMonth: number  // 0-100
}

const BAY_HOURS_PER_DAY = 96 // 4 bays x 24 hours

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeOperationsStats(serviceClient: any): Promise<OperationsStats> {
  const { weekStart, monthStart } = computePeriodBoundaries()
  const now = new Date()
  // Most of the month, monthStart is well before weekStart (e.g. day 20 of
  // a 30-day month) - query from whichever boundary is earlier so the
  // month bucket below isn't silently missing its first ~3 weeks.
  const queryStart = weekStart < monthStart ? weekStart : monthStart

  const { data: bookings } = await serviceClient
    .from("bookings")
    .select("starts_at, ends_at, total")
    .eq("status", "confirmed")
    .gte("starts_at", queryStart.toISOString())
    .lt("starts_at", now.toISOString())

  const rows = (bookings ?? []) as Array<{ starts_at: string; ends_at: string; total: number }>

  let bookingsWeek = 0
  let bookingsMonth = 0
  let hoursWeek = 0
  let hoursMonth = 0
  let monthDollarSum = 0
  let monthPaidBookings = 0 // total > 0 only - excludes hour-credit-covered ($0) bookings from the avg

  for (const b of rows) {
    const startsAt = new Date(b.starts_at)
    const hours = (new Date(b.ends_at).getTime() - startsAt.getTime()) / (1000 * 60 * 60)

    if (startsAt >= weekStart) {
      bookingsWeek += 1
      hoursWeek += hours
    }

    if (startsAt >= monthStart) {
      bookingsMonth += 1
      hoursMonth += hours
      const total = Number(b.total)
      if (total > 0) {
        monthDollarSum += total
        monthPaidBookings += 1
      }
    }
  }

  // Pace-adjusted: capacity is 96 hrs/day x days actually elapsed so far
  // this month (a fractional day, e.g. 5.3), not the full month length -
  // otherwise MTD utilization reads artificially low early in the month.
  const elapsedDaysInMonth = (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  const monthCapacityHours = BAY_HOURS_PER_DAY * elapsedDaysInMonth
  const weekCapacityHours = BAY_HOURS_PER_DAY * 7

  return {
    bookingsWeek,
    bookingsMonth,
    avgDollarPerBooking: monthPaidBookings > 0 ? monthDollarSum / monthPaidBookings : 0,
    utilizationWeek: (hoursWeek / weekCapacityHours) * 100,
    utilizationMonth: (hoursMonth / monthCapacityHours) * 100,
  }
}
