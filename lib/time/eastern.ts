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
