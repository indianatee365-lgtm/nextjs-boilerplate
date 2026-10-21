import { grantBayAccess, revokeBayAccess, updateBayAccessSchedule } from "@/lib/access-control"
import { sendAccessCodeReminder } from "@/lib/telnyx/sms"
import { logEvent, logFailure } from "@/lib/observability/notify"

// Door credentials used to be revoked in exactly one place, the */15
// revoke-access cron. That left a cancelled booking's PIN opening the front
// door until the next quarter-hour tick. Confirmed live 2026-09-29: a customer
// booked a second bay 8 minutes before its start (which issues the PIN inline,
// see lib/bookings/create.ts), cancelled it 8 seconds later, and still walked
// in 7 minutes before his real booking on the strength of the cancelled PIN.
//
// These helpers give cancel and reschedule an immediate revoke while leaving
// the cron as the backstop. The split matters: inline is the fast path, the
// cron is the guarantee. Nothing here throws, because a customer's
// cancellation and refund must never depend on the door controller being
// reachable.

// Mirrors lib/bookings/create.ts: inside this window there is no time to wait
// for the reminders cron, so the code is issued on the spot.
const IMMEDIATE_ISSUE_WINDOW_MINUTES = 15

// The Supabase service client. Typed loosely on purpose: several of these
// columns are missing from the generated types, and this module is called from
// route handlers and server actions that each construct the client themselves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any

interface AccessRow {
  id: string
  status: string
  unifi_visitor_id: string | null
  unifi_access_policy_id: string | null
  unifi_schedule_id: string | null
  access_revoked_at: string | null
}

const ACCESS_COLUMNS =
  "id, status, unifi_visitor_id, unifi_access_policy_id, unifi_schedule_id, access_revoked_at"

/**
 * Best-effort immediate revoke of a booking's door credential.
 *
 * Returns true when there is nothing live to revoke or the revoke succeeded,
 * false when UniFi refused. On false, access_revoked_at is deliberately left
 * null so the revoke-access cron finds the row and retries: stamping it on
 * failure would tell the cron the work was done and strand a live PIN.
 */
export async function revokeBookingAccess(db: DbClient, bookingId: string): Promise<boolean> {
  let row: AccessRow | null = null
  try {
    const { data } = await db.from("bookings").select(ACCESS_COLUMNS).eq("id", bookingId).maybeSingle()
    row = (data as AccessRow | null) ?? null
  } catch {
    return false
  }

  if (!row) return false

  // Most cancellations are days out and never had a credential issued, so
  // there is nothing to delete and no reason to call UniFi at all.
  if (!row.unifi_visitor_id) return true
  if (row.access_revoked_at) return true

  try {
    await revokeBayAccess(row.unifi_visitor_id, row.unifi_access_policy_id, row.unifi_schedule_id)
  } catch (err) {
    // No owner page here. The cron retries within 15 minutes, which is exactly
    // the behaviour that existed before this module, so a failure is no worse
    // than the old baseline and does not warrant waking anyone up.
    await logFailure(
      db,
      "booking-access-revoke-inline-FAILED",
      `booking=${bookingId} err=${String(err).slice(0, 200)} (revoke-access cron will retry)`,
    )
    return false
  }

  try {
    await db
      .from("bookings")
      .update({ access_revoked_at: new Date().toISOString() })
      .eq("id", bookingId)
  } catch {
    // Revoked at the controller but the stamp failed. Harmless: the cron will
    // try again, find the user already gone, and log that instead.
  }

  await logEvent(db, "booking-access-revoked-inline", `booking=${bookingId}`)
  return true
}

/**
 * Move a booking's door credential onto its new window after a reschedule.
 *
 * Rescheduling used to touch door access not at all, which failed in both
 * directions at once: the old PIN stayed valid for the OLD slot, and the
 * customer got nothing for the new one, because the reminders cron only issues
 * when access_code and reminder_sent_at are both still null.
 *
 * So: revoke the old credential, clear the issuance fields so a fresh code can
 * be minted for the new window, and if the new start is already inside the
 * immediate window, mint and text it now rather than waiting for the cron.
 */
export async function reissueBookingAccessForNewWindow(db: DbClient, bookingId: string): Promise<void> {
  let row: AccessRow | null = null
  try {
    const { data } = await db.from("bookings").select(ACCESS_COLUMNS).eq("id", bookingId).maybeSingle()
    row = (data as AccessRow | null) ?? null
  } catch {
    return
  }
  if (!row || row.status === "cancelled") return

  const hadCredential = Boolean(row.unifi_visitor_id)
  const revoked = hadCredential ? await revokeBookingAccess(db, bookingId) : true

  // A grant we could not delete still only opens the door during the window it
  // was created for, which this reschedule has just vacated, and UniFi expires
  // it on its own schedule. So carry on rather than leaving the customer with
  // no way in at the new time, but say so out loud: this is the one case that
  // wants a human to delete something by hand.
  if (hadCredential && !revoked) {
    await logFailure(
      db,
      "booking-access-stale-after-reschedule",
      `booking=${bookingId} visitor=${row.unifi_visitor_id} policy=${row.unifi_access_policy_id}`,
      `Rescheduled a booking but could NOT remove its old door code. That code still opens the ` +
        `door during the ORIGINAL time slot until UniFi expires it. Delete it by hand in UniFi Access.`,
    )
  }

  try {
    await db
      .from("bookings")
      .update({
        access_code: null,
        access_sent_at: null,
        access_code_issued_at: null,
        reminder_sent_at: null,
        access_revoked_at: null,
        ...(revoked
          ? { unifi_visitor_id: null, unifi_access_policy_id: null, unifi_schedule_id: null }
          : {}),
      })
      .eq("id", bookingId)
  } catch (err) {
    await logFailure(
      db,
      "booking-access-reset-FAILED",
      `booking=${bookingId} err=${String(err).slice(0, 200)}`,
      `Rescheduled a booking but could not reset its access fields, so no new door code will be ` +
        `issued for the new time. Check this booking before the customer arrives.`,
    )
    return
  }

  // Fetch the new window and the customer only now, so this reads the values
  // the reschedule actually committed rather than anything passed in.
  let fresh: {
    starts_at: string
    ends_at: string
    bays: { name: string } | null
    profiles: { first_name: string; last_name: string | null; phone: string | null; sms_consent: boolean } | null
  } | null = null
  try {
    const { data } = await db
      .from("bookings")
      .select("starts_at, ends_at, bays(name), profiles!user_id(first_name, last_name, phone, sms_consent)")
      .eq("id", bookingId)
      .maybeSingle()
    fresh = data ?? null
  } catch {
    return
  }
  if (!fresh?.bays) return

  const startsAt = new Date(fresh.starts_at)
  const minsUntil = (startsAt.getTime() - Date.now()) / 60000
  if (minsUntil > IMMEDIATE_ISSUE_WINDOW_MINUTES) return

  // Inside the window the reminders cron is too slow to be relied on, and this
  // is the common case for a staff member moving someone who is already stood
  // in the building.
  const p = fresh.profiles
  if (!p?.phone || !p.sms_consent) {
    await logEvent(
      db,
      "booking-access-reissue-no-sms",
      `booking=${bookingId} starts_in_min=${minsUntil.toFixed(1)} reason=${!p?.phone ? "no phone" : "no sms consent"}`,
    )
    return
  }

  try {
    const { pinCode, userId, accessPolicyId, scheduleId } = await grantBayAccess({
      bookingId,
      firstName: p.first_name ?? "Customer",
      lastName: p.last_name ?? undefined,
      phone: p.phone,
      bayName: fresh.bays.name,
      startsAt,
      endsAt: new Date(fresh.ends_at),
    })

    await db
      .from("bookings")
      .update({
        access_code: pinCode,
        unifi_visitor_id: userId,
        unifi_access_policy_id: accessPolicyId,
        unifi_schedule_id: scheduleId,
        reminder_sent_at: new Date().toISOString(),
        access_sent_at: new Date().toISOString(),
      })
      .eq("id", bookingId)

    await sendAccessCodeReminder({
      to: p.phone,
      firstName: p.first_name,
      bayName: fresh.bays.name,
      accessCode: pinCode,
      startsAt,
    })

    await logEvent(
      db,
      "booking-access-reissued-immediate",
      `booking=${bookingId} starts_in_min=${minsUntil.toFixed(1)}`,
    )
  } catch (err) {
    await logFailure(
      db,
      "booking-access-reissue-FAILED",
      `booking=${bookingId} err=${String(err).slice(0, 200)}`,
      `Moved a booking starting within ${IMMEDIATE_ISSUE_WINDOW_MINUTES} min but could NOT issue a ` +
        `new door code. The customer cannot get in. Let them in manually and check UniFi Access.`,
    )
  }
}

/**
 * Stretch a booking's door window to match its current ends_at.
 *
 * Call after anything that adds time to a booking (customer paid extend, the
 * Stripe webhook backstop, both admin comp-extend buttons). Until 2026-10-21
 * none of them touched UniFi, so the code kept the window it was minted with:
 * on 2026-10-21 Chase Coen was extended from 3:30 to 5:00pm on Bay 4 while
 * his code still stopped at 3:30. Stepping out to the car meant no way back in.
 *
 * Reads ends_at fresh from the row rather than taking it as an argument, so
 * it is idempotent and safe for finalizeExtend and the webhook to both reach.
 * Never throws: the extension is already paid for and applied, and must not
 * be undone or errored because the door controller is unreachable.
 */
export async function extendBookingAccessToCurrentEnd(db: DbClient, bookingId: string): Promise<void> {
  interface ExtendRow {
    id: string
    status: string
    starts_at: string
    ends_at: string
    parent_booking_id: string | null
    event_id: string | null
    unifi_schedule_id: string | null
    access_revoked_at: string | null
    bays: { name: string } | null
    profiles: { first_name: string | null; last_name: string | null; phone: string | null } | null
  }
  const COLUMNS =
    "id, status, starts_at, ends_at, parent_booking_id, event_id, unifi_schedule_id, access_revoked_at, " +
    "bays(name), profiles!user_id(first_name, last_name, phone)"

  let row: ExtendRow | null = null
  try {
    const { data } = await db.from("bookings").select(COLUMNS).eq("id", bookingId).maybeSingle()
    row = (data as ExtendRow | null) ?? null
  } catch {
    // Fall through to the alert below: we cannot tell whether the door follows.
  }

  const endsLocal = (iso: string) => new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
  })

  if (!row) {
    await logFailure(db, "booking-access-extend-FAILED", `booking=${bookingId} err=could not read booking`,
      `ALERT Booking ${bookingId} was extended but its door code could NOT be extended (lookup failed). ` +
        `Customer may be locked out if they step outside. CALL THEM.`)
    return
  }
  if (row.status === "cancelled") return

  // The second bay of a two-bay booking has no code of its own: the first
  // bay's code opens the door for the whole group (see lib/bookings/group.ts).
  // So extending either bay means stretching the parent's grant.
  let holder: Pick<ExtendRow, "id" | "starts_at" | "ends_at" | "unifi_schedule_id" | "access_revoked_at"> = row
  if (!row.unifi_schedule_id && row.parent_booking_id) {
    try {
      const { data } = await db.from("bookings")
        .select("id, starts_at, ends_at, unifi_schedule_id, access_revoked_at")
        .eq("id", row.parent_booking_id).maybeSingle()
      if (data) holder = data
    } catch { /* treated as no credential below */ }
  }

  if (!holder.unifi_schedule_id) {
    // Nothing minted yet (the reminders cron and the immediate-issue paths
    // read ends_at when they mint, so they pick up the extension on their
    // own), or the bench-test fallback PIN with no UniFi behind it, or an
    // event bay whose door code lives on the event. None of these need a call.
    await logEvent(db, "booking-access-extend-skipped",
      `booking=${bookingId} reason=${row.event_id ? "event bay, event door code" : "no unifi schedule"}`)
    return
  }
  if (holder.access_revoked_at) {
    await logEvent(db, "booking-access-extend-skipped", `booking=${bookingId} reason=credential already revoked`)
    return
  }

  // The group's door has to stay open until its LAST bay ends, not just the
  // bay that happened to be extended.
  let groupEnd = new Date(holder.ends_at)
  try {
    const { data: kids } = await db.from("bookings").select("ends_at")
      .eq("parent_booking_id", holder.id).eq("status", "confirmed")
    for (const k of (kids ?? []) as { ends_at: string }[]) {
      const t = new Date(k.ends_at)
      if (t.getTime() > groupEnd.getTime()) groupEnd = t
    }
  } catch { /* a lone booking has no children anyway */ }

  try {
    const updated = await updateBayAccessSchedule(holder.unifi_schedule_id, holder.id, new Date(holder.starts_at), groupEnd)
    if (updated) {
      await logEvent(db, "booking-access-extended",
        `booking=${bookingId} holder=${holder.id} schedule=${holder.unifi_schedule_id} newEnd=${groupEnd.toISOString()}`)
    }
  } catch (err) {
    const p = row.profiles
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Customer"
    await logFailure(db, "booking-access-extend-FAILED",
      `booking=${bookingId} holder=${holder.id} schedule=${holder.unifi_schedule_id} newEnd=${groupEnd.toISOString()} err=${String(err).slice(0, 200)}`,
      `ALERT Door code NOT extended: ${name}${p?.phone ? ` ${p.phone}` : ""}, ${row.bays?.name ?? "a bay"}, ` +
        `booking now ends ${endsLocal(groupEnd.toISOString())} but their code still stops at the old end time. ` +
        `Customer may be locked out if they step outside. CALL THEM.`)
  }
}
