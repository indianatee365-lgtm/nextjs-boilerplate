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

  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }

  // 1. Create the visitor, scoped to this door for the booking window.
  const visitorRes = await fetch(`${apiUrl}/visitors`, {
    method:  "POST",
    headers,
    body: JSON.stringify({
      first_name:   grant.firstName || "Customer",
      last_name:    grant.lastName  || `Bay ${grant.bayName}`,
      start_time:   grant.startsAt.getTime(),
      end_time:     grant.endsAt.getTime(),
      visit_reason: "Others",
      mobile_phone: grant.phone,
      remarks:      `Booking ${grant.bookingId} - ${grant.bayName}`,
      resources:    [{ id: doorId, type: "door" }],
    }),
  })
  const visitorJson = await visitorRes.json() as { code?: string; msg?: string; data?: { id: string } }
  if (!visitorRes.ok || visitorJson.code?.toUpperCase() !== "SUCCESS") {
    throw new Error(`Unifi create visitor ${visitorRes.status} ${visitorJson.code ?? ""}: ${visitorJson.msg ?? JSON.stringify(visitorJson)}`)
  }
  const visitorId = visitorJson.data!.id

  // 2. Generate a PIN code. Visitor creation never returns one — it's a separate credential
  // that has to be minted and then attached (UniFi Access API #6.1 + #4.9).
  const pinRes = await fetch(`${apiUrl}/credentials/pin_codes`, { method: "POST", headers, body: "" })
  const pinJson = await pinRes.json() as { code?: string; msg?: string; data?: string }
  if (!pinRes.ok || pinJson.code?.toUpperCase() !== "SUCCESS" || !pinJson.data) {
    throw new Error(`Unifi generate PIN ${pinRes.status} ${pinJson.code ?? ""}: ${pinJson.msg ?? JSON.stringify(pinJson)}`)
  }
  const pinCode = pinJson.data

  // 3. Assign the PIN to the visitor so it actually unlocks the door.
  const assignRes = await fetch(`${apiUrl}/visitors/${visitorId}/pin_codes`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ pin_code: pinCode }),
  })
  const assignJson = await assignRes.json() as { code?: string; msg?: string }
  if (!assignRes.ok || assignJson.code?.toUpperCase() !== "SUCCESS") {
    throw new Error(`Unifi assign PIN ${assignRes.status} ${assignJson.code ?? ""}: ${assignJson.msg ?? JSON.stringify(assignJson)}`)
  }

  return { pinCode, visitorId }
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
