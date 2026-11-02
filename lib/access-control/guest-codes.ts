import { randomUUID } from "crypto"
import { grantBayAccess, revokeBayAccess } from "@/lib/access-control"
import { DOOR_OPENS_EARLY_MINUTES } from "@/lib/access-control/constants"
import { addDaysToDateKey, easternMidnightUtc, easternTimeUtc } from "@/lib/time/eastern"

// One-day front door codes for non-customers (Jerrod 2026-11-02: "a code for
// my landlord, good only for today"). Works from midnight to midnight
// Eastern on the chosen day, or between optional From/Until times.

export type GuestCode = {
  id: string
  name: string
  pin_code: string
  starts_at: string
  ends_at: string
}

type Db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

export async function createGuestCode(
  db: Db, adminId: string, name: string, dateKey: string, fromTime?: string, untilTime?: string,
): Promise<GuestCode> {
  const dayStart = fromTime ? easternTimeUtc(dateKey, fromTime) : easternMidnightUtc(dateKey)
  const dayEnd = untilTime ? easternTimeUtc(dateKey, untilTime) : easternMidnightUtc(addDaysToDateKey(dateKey, 1))
  if (dayEnd.getTime() <= dayStart.getTime()) throw new Error("Until must be after From")
  const id = randomUUID()

  // grantBayAccess opens the door DOOR_OPENS_EARLY_MINUTES before startsAt,
  // so start that much later to make the code begin exactly at dayStart.
  const grant = await grantBayAccess({
    bookingId: `guest-${id}`,
    firstName: name,
    lastName: "(guest)",
    phone: "",
    bayName: "",
    startsAt: new Date(dayStart.getTime() + DOOR_OPENS_EARLY_MINUTES * 60 * 1000),
    endsAt: dayEnd,
    graceAfterEndMinutes: 0,
  })

  const row = {
    id,
    name,
    pin_code: grant.pinCode,
    starts_at: dayStart.toISOString(),
    ends_at: dayEnd.toISOString(),
    unifi_user_id: grant.userId,
    unifi_access_policy_id: grant.accessPolicyId,
    unifi_schedule_id: grant.scheduleId,
    created_by: adminId,
  }
  const { error } = await db.from("guest_door_codes").insert(row)
  if (error) {
    // Don't leave a working code nobody can see or revoke.
    if (grant.userId) await revokeBayAccess(grant.userId, grant.accessPolicyId, grant.scheduleId)
    throw new Error("Failed to save the guest code")
  }
  return { id, name, pin_code: grant.pinCode, starts_at: row.starts_at, ends_at: row.ends_at }
}

export async function revokeGuestCode(db: Db, id: string): Promise<void> {
  const { data } = await db.from("guest_door_codes")
    .select("unifi_user_id, unifi_access_policy_id, unifi_schedule_id")
    .eq("id", id).is("revoked_at", null).maybeSingle()
  if (!data) return
  if (data.unifi_user_id) {
    await revokeBayAccess(data.unifi_user_id, data.unifi_access_policy_id, data.unifi_schedule_id)
  }
  await db.from("guest_door_codes").update({ revoked_at: new Date().toISOString() }).eq("id", id)
}
