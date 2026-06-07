// Unifi Access integration — issues time-bound visitor PINs for bay bookings.
// When UNIFI_ACCESS_API_URL is not set (e.g. during bench test phase), falls back to
// a locally-generated random PIN so the rest of the booking flow is unaffected.
//
// LAUNCH: set UNIFI_ACCESS_API_URL, UNIFI_ACCESS_TOKEN, UNIFI_DOOR_ID in Vercel env
// after bench test passes. See tee365-vestibule-shopping.md for full API spec.

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
  visitorId: string | null   // null when Unifi not configured; save to bookings.unifi_visitor_id
}

export async function grantBayAccess(grant: AccessControlGrant): Promise<AccessControlResult> {
  const apiUrl   = process.env.UNIFI_ACCESS_API_URL
  const apiToken = process.env.UNIFI_ACCESS_TOKEN
  const doorId   = process.env.UNIFI_DOOR_ID

  if (!apiUrl || !apiToken || !doorId) {
    // Bench test / pre-hardware fallback: random PIN, no controller call
    return { pinCode: String(randomInt(100000, 1000000)), visitorId: null }
  }

  const body = {
    first_name:   grant.firstName || "Customer",
    last_name:    grant.lastName  || `Bay ${grant.bayName}`,
    start_time:   Math.floor(grant.startsAt.getTime() / 1000),
    end_time:     Math.floor(grant.endsAt.getTime() / 1000),
    visit_reason: "Others",
    mobile_phone: grant.phone,
    remarks:      `Booking ${grant.bookingId} - ${grant.bayName}`,
    resources:    [{ id: doorId, type: "door" }],
  }

  const res = await fetch(`${apiUrl}/visitors`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })

  const json = await res.json() as { code?: string; msg?: string; data?: { id: string; pin_code: string[] | string } }
  if (!res.ok || json.code?.toUpperCase() !== "SUCCESS") {
    throw new Error(`Unifi ${res.status} ${json.code ?? ""}: ${json.msg ?? JSON.stringify(json)}`)
  }

  const data    = json.data!
  const pinCode = (Array.isArray(data.pin_code) ? data.pin_code[0] : data.pin_code) as string
  if (!pinCode) throw new Error("Unifi returned visitor with no PIN")

  return { pinCode, visitorId: data.id }
}

export async function revokeBayAccess(visitorId: string): Promise<void> {
  const apiUrl   = process.env.UNIFI_ACCESS_API_URL
  const apiToken = process.env.UNIFI_ACCESS_TOKEN
  if (!apiUrl || !apiToken || !visitorId) return

  const res = await fetch(`${apiUrl}/visitors/${visitorId}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Unifi DELETE ${res.status}`)
  }
}
