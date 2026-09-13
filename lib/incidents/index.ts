import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type Service = SupabaseClient<Database>

export const FACILITY_TZ = "America/Indiana/Indianapolis"

/** How far either side of a reported time we have to look, by how much we trust it. */
const PAD_MINUTES: Record<string, number> = {
  exact: 3,
  approximate: 20,
  unknown: 0, // handled separately: fall back to the whole booking
}

export type VideoWindow = {
  start: Date
  end: Date
  /** Plain-language chain of what narrowed the window, tightest step last. */
  basis: string[]
  /** Minutes of footage to review. */
  minutes: number
}

export type ShotMarker = {
  created_at: string
  club: string | null
  club_speed_mph: number | null
  ball_speed_mph: number | null
  hitter_name: string | null
  shot_number: number | null
}

export type IncidentContext = {
  booking: {
    id: string
    starts_at: string
    ends_at: string
    access_code: string | null
    roster_names: string[] | null
    bay_powered_on_at: string | null
    bay_powered_off_at: string | null
  } | null
  bayNumber: number | null
  window: VideoWindow | null
  lastShotBefore: ShotMarker | null
  firstShotAfter: ShotMarker | null
  shotGapMinutes: number | null
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000)
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000)
}

/** Minutes the zone is ahead of UTC at a given instant. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return (asUtc - date.getTime()) / 60_000
}

/**
 * Turn a wall-clock time at the facility into a real instant.
 *
 * A datetime-local input and a caller saying "about seven last night" both give
 * us Mishawaka wall time with no zone. Reading that with new Date() on a UTC
 * server lands the incident four or five hours off, which is exactly the window
 * you would then fail to find on camera. Resolving the zone offset explicitly,
 * twice so a DST boundary settles, avoids depending on the server's own zone.
 */
export function facilityLocalToUtc(local: string): Date | null {
  const naive = Date.parse(local.length === 16 ? `${local}:00Z` : `${local}Z`)
  if (Number.isNaN(naive)) return null

  let ts = naive
  for (let i = 0; i < 2; i++) {
    ts = naive - tzOffsetMinutes(new Date(ts), FACILITY_TZ) * 60_000
  }
  return new Date(ts)
}

/**
 * Accept either a fully-qualified instant (the phone agent can compute one) or
 * a bare wall time, which we read as facility-local.
 */
export function parseReportedTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)
  if (hasZone) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return facilityLocalToUtc(trimmed)
}

export function formatFacilityTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleString("en-US", {
    timeZone: FACILITY_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Find the booking that covers a moment in a bay. A club that broke during a
 * session has a booking; one found afterwards may not.
 */
export async function findBookingAt(
  service: Service,
  bayId: string | null,
  occurredAt: string | null,
): Promise<IncidentContext["booking"]> {
  if (!bayId || !occurredAt) return null

  const { data } = await service
    .from("bookings")
    .select("id, starts_at, ends_at, access_code, roster_names, bay_powered_on_at, bay_powered_off_at")
    .eq("bay_id", bayId)
    .lte("starts_at", occurredAt)
    .gte("ends_at", occurredAt)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

/**
 * Build the tightest defensible window of footage to review.
 *
 * The chain, tightest wins: start from the reported time plus a pad sized to
 * how much we trust it, clamp to the booking, then squeeze to the gap between
 * the last shot before and the first shot after. A club that snapped mid-swing
 * leaves exactly that gap in the shot feed, and it is almost always tighter
 * than anything the customer can remember.
 */
export function buildVideoWindow(
  occurredAt: string | null,
  timeConfidence: string,
  booking: IncidentContext["booking"],
  lastShotBefore: ShotMarker | null,
  firstShotAfter: ShotMarker | null,
): VideoWindow | null {
  const basis: string[] = []
  let start: Date
  let end: Date

  if (occurredAt && timeConfidence !== "unknown") {
    const at = new Date(occurredAt)
    const pad = PAD_MINUTES[timeConfidence] ?? 20
    start = addMinutes(at, -pad)
    end = addMinutes(at, pad)
    basis.push(`Reported time ${formatFacilityTime(at)}, ${timeConfidence}, padded ${pad} min either side`)
  } else if (booking) {
    start = new Date(booking.starts_at)
    end = new Date(booking.ends_at)
    basis.push("No usable reported time, falling back to the full booking")
  } else {
    return null
  }

  if (booking) {
    const bStart = new Date(booking.bay_powered_on_at ?? booking.starts_at)
    const bEnd = new Date(booking.bay_powered_off_at ?? booking.ends_at)
    const clampedStart = start < bStart ? bStart : start
    const clampedEnd = end > bEnd ? bEnd : end
    if (clampedStart.getTime() !== start.getTime() || clampedEnd.getTime() !== end.getTime()) {
      basis.push("Clamped to when the bay was actually powered on")
    }
    start = clampedStart
    end = clampedEnd
  }

  if (lastShotBefore) {
    const t = new Date(lastShotBefore.created_at)
    if (t > start) {
      start = t
      basis.push(`Last tracked shot at ${formatFacilityTime(t)}${lastShotBefore.club ? ` (${lastShotBefore.club})` : ""}`)
    }
  }

  if (firstShotAfter) {
    const t = new Date(firstShotAfter.created_at)
    if (t < end) {
      end = t
      basis.push(`Next tracked shot at ${formatFacilityTime(t)}`)
    }
  }

  if (end <= start) end = addMinutes(start, 2)

  return { start, end, basis, minutes: Math.max(minutesBetween(start, end), 1) }
}

/**
 * Everything needed to go find the moment on camera: the booking, who was on
 * the roster, and the shot feed bracketing the incident.
 */
export async function getIncidentContext(
  service: Service,
  incident: {
    bay_id: string | null
    booking_id: string | null
    occurred_at: string | null
    time_confidence: string
  },
): Promise<IncidentContext> {
  let booking: IncidentContext["booking"] = null

  if (incident.booking_id) {
    const { data } = await service
      .from("bookings")
      .select("id, starts_at, ends_at, access_code, roster_names, bay_powered_on_at, bay_powered_off_at")
      .eq("id", incident.booking_id)
      .maybeSingle()
    booking = data ?? null
  }

  if (!booking) {
    booking = await findBookingAt(service, incident.bay_id, incident.occurred_at)
  }

  let bayNumber: number | null = null
  if (incident.bay_id) {
    const { data: bay } = await service
      .from("bays")
      .select("number")
      .eq("id", incident.bay_id)
      .maybeSingle()
    bayNumber = bay?.number ?? null
  }

  let lastShotBefore: ShotMarker | null = null
  let firstShotAfter: ShotMarker | null = null

  const shotFields = "created_at, club, club_speed_mph, ball_speed_mph, hitter_name, shot_number"

  if (incident.occurred_at && incident.bay_id) {
    const { data: before } = await service
      .from("shots")
      .select(shotFields)
      .eq("bay_id", incident.bay_id)
      .lte("created_at", incident.occurred_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    lastShotBefore = before ?? null

    const { data: after } = await service
      .from("shots")
      .select(shotFields)
      .eq("bay_id", incident.bay_id)
      .gt("created_at", incident.occurred_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    firstShotAfter = after ?? null
  }

  const window = buildVideoWindow(
    incident.occurred_at,
    incident.time_confidence,
    booking,
    lastShotBefore,
    firstShotAfter,
  )

  const shotGapMinutes =
    lastShotBefore && firstShotAfter
      ? minutesBetween(new Date(lastShotBefore.created_at), new Date(firstShotAfter.created_at))
      : null

  return { booking, bayNumber, window, lastShotBefore, firstShotAfter, shotGapMinutes }
}
