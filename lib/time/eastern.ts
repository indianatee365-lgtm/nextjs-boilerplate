/**
 * Calendar-date helpers pinned to the facility's timezone.
 *
 * Server code runs in UTC on Vercel, so anything built from setHours() or
 * getDate() there is a UTC day, which ends at 7pm or 8pm Eastern. That is the
 * recurring bug class behind several day-boundary mistakes; compare these
 * YYYY-MM-DD keys instead. They sort as strings.
 */
const BUSINESS_TZ = "America/Indiana/Indianapolis"

/** The Eastern calendar date of an instant, as YYYY-MM-DD. */
export function easternDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date)
}

/** A YYYY-MM-DD key moved by whole calendar days. */
export function addDaysToDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The UTC instant of midnight Eastern at the start of a YYYY-MM-DD day.
 * Eastern is UTC-4 or UTC-5; whichever offset lands on 00:00 locally is it.
 */
export function easternMidnightUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours))
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TZ, hour: "2-digit", hour12: false,
    }).format(candidate)
    if (easternDateKey(candidate) === key && parseInt(hour, 10) % 24 === 0) return candidate
  }
  return new Date(Date.UTC(y, m - 1, d, 5))
}
