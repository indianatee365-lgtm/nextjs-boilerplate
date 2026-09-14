import { logEvent, logFailure, notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { revokeBayAccess } from "@/lib/access-control"
import { sendAccountBannedEmail } from "@/lib/resend/email"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export interface BanResult {
  ok: boolean
  message: string
  /** Future bookings that are still paid and uncancelled. Door access is gone,
   *  but the money question is the owner's to settle. */
  outstandingBookings?: { id: string; startsAt: string; total: number }[]
}

/**
 * Bar a customer from the facility.
 *
 * The Facility Rules disclosure promises a permanent ban for a zero-tolerance
 * violation, and until now nothing enforced it. Setting the flag is only half
 * the job: someone banned tonight may already hold a door PIN for tomorrow,
 * so this also revokes UniFi access on every upcoming booking. Without that,
 * the ban notice would be telling them their codes are dead while the door
 * still opened for them.
 *
 * What this deliberately does NOT do is cancel those bookings or refund them.
 * The disclosure says removal is "without refund", but that is a judgement
 * call with real money attached and it belongs to a person, not a checkbox.
 * The outstanding bookings come back in the result so the admin UI can say
 * exactly what still needs a decision.
 */
export async function banCustomer(
  serviceClient: SupabaseClient,
  params: { userId: string; reason: string; actorId: string; notify: boolean }
): Promise<BanResult> {
  const { userId, reason, actorId, notify } = params

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name, banned")
    .eq("id", userId)
    .maybeSingle()
  const p = profile as { first_name: string; last_name: string; banned: boolean } | null
  if (!p) return { ok: false, message: "No such account." }
  if (p.banned) return { ok: false, message: "This account is already banned." }

  const { error: flagErr } = await serviceClient
    .from("profiles")
    .update({
      banned: true,
      banned_at: new Date().toISOString(),
      banned_reason: reason,
      banned_by: actorId,
    })
    .eq("id", userId)
  if (flagErr) return { ok: false, message: "Could not update this account." }

  // Kill any door access they already hold. Upcoming only: a code for a
  // session that has already happened is spent, and UniFi's schedule has
  // closed it anyway.
  const nowIso = new Date().toISOString()
  const { data: futureBookings } = await serviceClient
    .from("bookings")
    .select("id, starts_at, total, status, unifi_visitor_id, unifi_access_policy_id, unifi_schedule_id, access_revoked_at")
    .eq("user_id", userId)
    .gte("starts_at", nowIso)
    .neq("status", "cancelled")

  const bookings = (futureBookings ?? []) as {
    id: string
    starts_at: string
    total: number
    status: string
    unifi_visitor_id: string | null
    unifi_access_policy_id: string | null
    unifi_schedule_id: string | null
    access_revoked_at: string | null
  }[]

  let revoked = 0
  let revokeFailures = 0
  for (const b of bookings) {
    if (!b.unifi_visitor_id || b.access_revoked_at) continue
    try {
      await revokeBayAccess(b.unifi_visitor_id, b.unifi_access_policy_id, b.unifi_schedule_id)
      await serviceClient
        .from("bookings")
        .update({ access_revoked_at: new Date().toISOString() })
        .eq("id", b.id)
      revoked++
    } catch (err) {
      revokeFailures++
      await logFailure(serviceClient, "ban-access-revoke-FAILED",
        `user=${userId} booking=${b.id} err=${String(err).slice(0, 200)}`,
        `ALERT Ban applied but door access NOT revoked for booking ${b.id}. Revoke it in UniFi by hand now.`)
    }
  }

  const outstanding = bookings
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({ id: b.id, startsAt: b.starts_at, total: Number(b.total) }))

  await logEvent(serviceClient, "customer-banned",
    `user=${userId} by=${actorId} revoked=${revoked} revoke_failures=${revokeFailures} outstanding_bookings=${outstanding.length} reason=${reason}`)

  if (notify) {
    try {
      const { data: authRes } = await serviceClient.auth.admin.getUserById(userId)
      const email = authRes?.user?.email
      if (email) {
        const { data: mem } = await serviceClient
          .from("memberships").select("id").eq("user_id", userId).in("status", ["active", "past_due"]).maybeSingle()
        await sendAccountBannedEmail({
          to: email,
          firstName: p.first_name,
          reason,
          hadMembership: Boolean(mem),
        })
      }
    } catch (err) {
      await logFailure(serviceClient, "ban-email-FAILED",
        `user=${userId} err=${String(err).slice(0, 200)}`)
    }
  }

  const custName = await getCustomerName(serviceClient, userId)
  await notifyOwner(`Customer BANNED, ${custName}. ${revoked} door code(s) revoked, ${outstanding.length} upcoming booking(s) still open. Reason: ${reason}`)

  const parts = [`${p.first_name} ${p.last_name} is banned.`]
  parts.push(revoked === 1 ? "1 door code revoked." : `${revoked} door codes revoked.`)
  if (revokeFailures) parts.push(`${revokeFailures} revoke(s) FAILED, fix in UniFi by hand.`)
  if (outstanding.length) {
    parts.push(`${outstanding.length} upcoming booking(s) are still active and paid. They cannot get in, but you need to decide whether to cancel and refund them.`)
  }
  if (notify) parts.push("Notice emailed.")

  return { ok: true, message: parts.join(" "), outstandingBookings: outstanding }
}

/**
 * Lift a ban. Note this cannot put back a door code that was deleted at UniFi:
 * those bookings need a fresh code issued, which the access-code cron does on
 * its next run for anything still upcoming.
 */
export async function unbanCustomer(
  serviceClient: SupabaseClient,
  params: { userId: string; actorId: string }
): Promise<BanResult> {
  const { userId, actorId } = params

  const { error } = await serviceClient
    .from("profiles")
    .update({ banned: false, banned_at: null, banned_reason: null, banned_by: null })
    .eq("id", userId)
  if (error) return { ok: false, message: "Could not update this account." }

  await logEvent(serviceClient, "customer-unbanned", `user=${userId} by=${actorId}`)
  const custName = await getCustomerName(serviceClient, userId)
  await notifyOwner(`Ban LIFTED, ${custName}. They can book again.`)

  return {
    ok: true,
    message: "Ban lifted. They can book again. Any door codes revoked during the ban are gone for good; the access-code cron issues a fresh one for anything still upcoming.",
  }
}
