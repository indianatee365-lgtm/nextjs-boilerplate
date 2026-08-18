// Unifi Access integration — issues time-bound door PINs for bay bookings via
// the User API (not Visitor). Visitor PINs never actually unlock the door
// until someone manually clicks "Mark as Arrived" in the UniFi admin console -
// there's no API for that (confirmed against live hardware and the official
// docs, which say "Status change is not supported" for visitors). Users
// activate immediately with no human in the loop, gated instead by a
// per-booking Access Policy + Schedule scoped to a single weekday/time window -
// the same mechanism the owner's own permanent door PIN uses.
//
// When UNIFI_ACCESS_API_URL is not set (e.g. during bench test phase), falls back to
// a locally-generated random PIN so the rest of the booking flow is unaffected.

import { randomInt } from "crypto"

export interface AccessControlGrant {
  bookingId: string
  firstName: string
  lastName?: string
  phone: string        // E.164
  bayName: string
  startsAt: Date
  endsAt: Date
}

export interface AccessControlResult {
  pinCode: string
  userId: string | null           // null when Unifi not configured; save to bookings.unifi_visitor_id
  accessPolicyId: string | null   // save to bookings.unifi_access_policy_id
  scheduleId: string | null       // save to bookings.unifi_schedule_id
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

// The door unlocks this many minutes before the booked start time, matching
// when the access-code SMS goes out (see the "starts within 15 min" checks
// in the Stripe webhook, the free-booking path, and the reminders cron) -
// customers should be walking in and playing at their start time, not
// standing outside until the second it hits.
const DOOR_OPENS_EARLY_MINUTES = 15

// Business timezone, matching the rest of the booking system.
function localTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Indiana/Indianapolis",
    weekday: "long",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  const weekday = get("weekday").toLowerCase()
  const hour = get("hour").padStart(2, "0")
  const rawHour = hour === "24" ? "00" : hour
  const minute = get("minute").padStart(2, "0")
  const second = get("second").padStart(2, "0")
  return { weekday, time: `${rawHour}:${minute}:${second}` }
}

async function unifiCall<T>(apiUrl: string, headers: HeadersInit, path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  })
  const json = (await res.json()) as { code?: string; msg?: string; data?: T }
  if (!res.ok || json.code?.toUpperCase() !== "SUCCESS") {
    throw new Error(`Unifi ${method} ${path} ${res.status} ${json.code ?? ""}: ${json.msg ?? JSON.stringify(json)}`)
  }
  return json.data as T
}

export async function grantBayAccess(grant: AccessControlGrant): Promise<AccessControlResult> {
  const apiUrl   = process.env.UNIFI_ACCESS_API_URL
  const apiToken = process.env.UNIFI_ACCESS_TOKEN
  const doorId   = process.env.UNIFI_DOOR_ID

  if (!apiUrl || !apiToken || !doorId) {
    // Bench test / pre-hardware fallback: random PIN, no controller call
    return { pinCode: String(randomInt(100000, 1000000)), userId: null, accessPolicyId: null, scheduleId: null }
  }

  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }

  // Populated with this exact booking's window (door-open time through
  // session end) - grants access for that one occurrence, not every week,
  // as long as the User is deleted promptly after the booking ends (see
  // revokeBayAccess). Door opens DOOR_OPENS_EARLY_MINUTES before the booked
  // start; for a late booking that pushes the open time into the previous
  // local day (or a session that itself runs past local midnight), the
  // window is split across the two weekdays it actually touches - a single
  // weekday's start/end pair can't represent a span that crosses midnight.
  const doorOpensAt = new Date(grant.startsAt.getTime() - DOOR_OPENS_EARLY_MINUTES * 60 * 1000)
  const start = localTimeParts(doorOpensAt)
  const end = localTimeParts(grant.endsAt)
  const weekSchedule: Record<string, Array<{ start_time: string; end_time: string }>> = {}
  for (const day of WEEKDAYS) weekSchedule[day] = []
  if (start.weekday === end.weekday) {
    weekSchedule[start.weekday] = [{ start_time: start.time, end_time: end.time }]
  } else {
    weekSchedule[start.weekday] = [{ start_time: start.time, end_time: "23:59:59" }]
    weekSchedule[end.weekday] = [{ start_time: "00:00:00", end_time: end.time }]
  }

  const schedule = await unifiCall<{ id: string }>(apiUrl, headers, "/access_policies/schedules", "POST", {
    name: `booking-${grant.bookingId}`,
    week_schedule: weekSchedule,
  })

  const policy = await unifiCall<{ id: string }>(apiUrl, headers, "/access_policies", "POST", {
    name: `booking-${grant.bookingId}`,
    resource: [{ id: doorId, type: "door" }],
    schedule_id: schedule.id,
  })

  const user = await unifiCall<{ id: string }>(apiUrl, headers, "/users", "POST", {
    first_name: grant.firstName || "Customer",
    last_name:  grant.lastName  || `Bay ${grant.bayName}`,
  })

  const pinCode = await unifiCall<string>(apiUrl, headers, "/credentials/pin_codes", "POST", "")

  await unifiCall(apiUrl, headers, `/users/${user.id}/pin_codes`, "PUT", { pin_code: pinCode })
  await unifiCall(apiUrl, headers, `/users/${user.id}/access_policies`, "PUT", { access_policy_ids: [policy.id] })

  return { pinCode, userId: user.id, accessPolicyId: policy.id, scheduleId: schedule.id }
}

export async function revokeBayAccess(userId: string, accessPolicyId: string | null, scheduleId: string | null): Promise<void> {
  const apiUrl   = process.env.UNIFI_ACCESS_API_URL
  const apiToken = process.env.UNIFI_ACCESS_TOKEN
  if (!apiUrl || !apiToken || !userId) return

  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }

  // Users must be deactivated before they can be deleted.
  await unifiCall(apiUrl, headers, `/users/${userId}`, "PUT", { status: "DEACTIVATED" })
  await unifiCall(apiUrl, headers, `/users/${userId}`, "DELETE")

  if (accessPolicyId) {
    await unifiCall(apiUrl, headers, `/access_policies/${accessPolicyId}`, "DELETE")
  }
  if (scheduleId) {
    await unifiCall(apiUrl, headers, `/access_policies/schedules/${scheduleId}`, "DELETE")
  }
}
