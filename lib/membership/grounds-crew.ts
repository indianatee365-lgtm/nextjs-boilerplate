/**
 * Grounds Crew hours: the Albatross perk, decided 2026-10-07.
 *
 * Free bay time between midnight and 8am on weekday mornings (Mon to Fri,
 * Eastern), up to the plan's grounds_crew_daily_hours per morning, for a
 * booking made no more than 24 hours ahead. Friday night into Saturday and
 * Saturday night into Sunday are deliberately excluded: that is where the
 * real paying late-night demand is.
 *
 * This file only answers "how many minutes of this booking are free". The two
 * limits that depend on other bookings (no more than 2 bays in free use at
 * once, one bay per member, and the per-morning allowance) are enforced by the database trigger
 * bookings_grounds_crew_limits, because an app-side count cannot stop two
 * requests that land at the same moment. The app checks them first anyway so
 * the customer gets a clear message before any payment is started.
 *
 * Only the part of a booking inside the start date's window is free: a 7am to
 * 9am booking is one free hour and one paid hour. Pure functions, no DB, so
 * the /book price preview and the server charge run the identical math.
 */

const BUSINESS_TZ = "America/Indiana/Indianapolis"

export const GROUNDS_CREW_END_HOUR = 8
export const GROUNDS_CREW_BOOK_AHEAD_HOURS = 24
export const GROUNDS_CREW_MAX_BAYS = 2

function localParts(date: Date): { dateKey: string; weekday: number; minuteOfDay: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  const hour = parseInt(parts.hour, 10) % 24
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    minuteOfDay: hour * 60 + parseInt(parts.minute, 10),
  }
}

/** The Eastern calendar date a booking's free time counts against, as YYYY-MM-DD. */
export function groundsCrewDateKey(startsAt: Date): string {
  return localParts(startsAt).dateKey
}

/** Minutes of this booking inside a Grounds Crew window, before any allowance or timing rule. */
export function minutesInGroundsCrewWindow(startsAt: Date, durationMinutes: number): number {
  const { weekday, minuteOfDay } = localParts(startsAt)
  if (weekday < 1 || weekday > 5) return 0
  const windowEnd = GROUNDS_CREW_END_HOUR * 60
  if (minuteOfDay >= windowEnd) return 0
  return Math.min(durationMinutes, windowEnd - minuteOfDay)
}

/**
 * Free minutes for this booking. 0 for anyone whose plan has no Grounds Crew
 * allowance, which is every plan except Albatross.
 */
export function groundsCrewFreeMinutes({
  startsAt,
  durationMinutes,
  now,
  dailyAllowanceMinutes,
  usedMinutesThatMorning,
}: {
  startsAt: Date
  durationMinutes: number
  now: Date
  dailyAllowanceMinutes: number
  usedMinutesThatMorning: number
}): number {
  if (dailyAllowanceMinutes <= 0) return 0
  if (startsAt.getTime() - now.getTime() > GROUNDS_CREW_BOOK_AHEAD_HOURS * 3600 * 1000) return 0
  const remaining = Math.max(0, dailyAllowanceMinutes - usedMinutesThatMorning)
  return Math.min(minutesInGroundsCrewWindow(startsAt, durationMinutes), remaining)
}

/** The trigger's error messages, mapped to what the customer reads. */
export function groundsCrewErrorMessage(dbMessage: string | undefined | null): string | null {
  if (!dbMessage) return null
  if (dbMessage.includes("GROUNDS_CREW_FULL")) {
    return "Grounds Crew is full at that time (2 bays already in use). Pick another time."
  }
  if (dbMessage.includes("GROUNDS_CREW_ONE_BAY")) {
    return "Grounds Crew is one bay per member, and you already have one at that time."
  }
  if (dbMessage.includes("GROUNDS_CREW_DAILY_LIMIT")) {
    return "You've already used your free Grounds Crew hours for that morning."
  }
  return null
}
