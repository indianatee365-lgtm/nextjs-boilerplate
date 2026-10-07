import Stripe from "stripe"
import { revokeBookingAccess } from "@/lib/access-control/booking-access"
import { restoreHourCredits } from "@/lib/hour-credits"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"
import { sendBookingCancellationSms, sendBookingPaymentFailedSms } from "@/lib/telnyx/sms"
import { sendBookingCancellationEmail } from "@/lib/resend/email"
import { getStillConfirmedBayNames } from "@/lib/bookings/still-confirmed"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Two-bay bookings, 2026-10-07.
 *
 * A group is the first bay (the parent row, which holds the one Stripe payment
 * for both bays) plus a second bay whose parent_booking_id points at it. The
 * second bay has no payment intent or charge of its own, gets no door code of
 * its own (the parent's code opens the one front door for the whole group),
 * and is confirmed, cancelled and refunded only together with the parent.
 *
 * Every path that confirms, cancels or refunds a booking checks for a group
 * first and hands it here, leaving the single-bay code untouched. The rule
 * that matters most: a refund is ONE full refund of the parent's charge.
 * Refunding per row would refund the whole charge twice.
 */

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
}

/** True only when the switch on /admin/settings is explicitly on. */
export async function isTwoBayBookingOn(db: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await db.from("admin_settings").select("value").eq("key", "two_bay_booking").maybeSingle()
    return data?.value === true
  } catch {
    return false
  }
}

export interface GroupRow {
  id: string
  parent_booking_id: string | null
  user_id: string
  status: string
  starts_at: string
  ends_at: string
  total: number
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  bays: { name: string } | null
}

const GROUP_COLUMNS =
  "id, parent_booking_id, user_id, status, starts_at, ends_at, total, stripe_payment_intent_id, stripe_charge_id, bays(name)"

/**
 * Every row of the group this booking belongs to, parent first. A booking
 * that is not part of a group comes back as a one-row list.
 */
export async function getBookingGroup(db: SupabaseClient, bookingId: string): Promise<GroupRow[]> {
  const { data: row } = await db.from("bookings").select("id, parent_booking_id").eq("id", bookingId).maybeSingle()
  if (!row) return []
  const rootId = (row as { parent_booking_id: string | null }).parent_booking_id ?? bookingId
  const { data } = await db
    .from("bookings")
    .select(GROUP_COLUMNS)
    .or(`id.eq.${rootId},parent_booking_id.eq.${rootId}`)
  const rows = (data ?? []) as GroupRow[]
  return rows.sort((a, b) => (a.id === rootId ? -1 : b.id === rootId ? 1 : 0))
}

/** True when this booking is either bay of a two-bay booking. */
export async function isGroupedBooking(
  db: SupabaseClient,
  booking: { id: string; parent_booking_id?: string | null },
): Promise<boolean> {
  if (booking.parent_booking_id) return true
  const { count } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("parent_booking_id", booking.id)
  return (count ?? 0) > 0
}

export const GROUP_RESCHEDULE_MESSAGE =
  "Two-bay bookings can't be moved online yet. Cancel and rebook, or text us and we'll move both bays for you."

export function bayLabel(names: string[]): string {
  return names.filter(Boolean).join(" and ")
}

/**
 * Cancel a whole group, with one refund of the parent's charge when
 * `refundEligible`. Customer and admin cancel both land here for any booking
 * that is part of a group, whichever of its bays they clicked.
 */
export async function cancelBookingGroup(
  db: SupabaseClient,
  group: GroupRow[],
  { actorId, refundEligible }: { actorId: string; refundEligible: boolean },
): Promise<{ refundIssued: boolean; refundAmount: number; creditHoursRestored: number }> {
  const parent = group[0]
  const live = group.filter((g) => g.status !== "cancelled")
  if (live.length === 0) return { refundIssued: false, refundAmount: 0, creditHoursRestored: 0 }

  const combinedTotal = live.reduce((sum, g) => sum + Number(g.total ?? 0), 0)

  let refundIssued = false
  if (parent.status === "pending" && parent.stripe_payment_intent_id) {
    try {
      await getStripe().paymentIntents.cancel(parent.stripe_payment_intent_id)
    } catch { /* already cancelled or captured */ }
  } else if (refundEligible && parent.stripe_charge_id && combinedTotal > 0) {
    // One refund of the whole charge, which covers every bay in the group.
    await getStripe().refunds.create({ charge: parent.stripe_charge_id })
    refundIssued = true
  }

  const now = new Date().toISOString()
  for (const g of live) {
    await db.from("bookings").update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: actorId,
      refund_amount: refundIssued ? g.total : 0,
      refunded_at: refundIssued ? now : null,
    }).eq("id", g.id)
  }

  let creditHoursRestored = 0
  for (const g of live) {
    await revokeBookingAccess(db, g.id)
    if (refundEligible || g.status === "pending") {
      creditHoursRestored += await restoreHourCredits(db, g.id)
    }
  }

  await logEvent(db, "booking-group-cancelled",
    `bookings=${live.map((g) => g.id).join(",")} by=${actorId} refund=${refundIssued ? combinedTotal : 0}`)

  const names = bayLabel(live.map((g) => g.bays?.name ?? ""))
  const { data: profile } = await db.from("profiles").select("first_name, phone, sms_consent").eq("id", parent.user_id).single()
  const p = profile as { first_name: string; phone: string | null; sms_consent: boolean } | null
  const refundAmount = refundIssued ? combinedTotal : 0

  if (p?.phone && p.sms_consent) {
    try {
      await sendBookingCancellationSms({
        to: p.phone, firstName: p.first_name, bayName: names,
        startsAt: new Date(parent.starts_at), endsAt: new Date(parent.ends_at),
        refundAmount, creditHoursRestored,
      })
    } catch (e) {
      await logFailure(db, "booking-cancellation-sms-FAILED", `group=${parent.id} err=${String(e).slice(0, 200)}`)
    }
  }
  const { data: { user: authUser } } = await db.auth.admin.getUserById(parent.user_id)
  if (authUser?.email) {
    try {
      await sendBookingCancellationEmail({
        to: authUser.email, firstName: p?.first_name ?? "", bayName: names,
        startsAt: new Date(parent.starts_at), endsAt: new Date(parent.ends_at),
        refundAmount, creditHoursRestored,
      })
    } catch (e) {
      await logFailure(db, "booking-cancellation-email-FAILED", `group=${parent.id} err=${String(e).slice(0, 200)}`)
    }
  }

  return { refundIssued, refundAmount, creditHoursRestored }
}

/**
 * Called by the Stripe webhook right after the parent row is confirmed:
 * confirms the second bay that rides on the same payment.
 *
 * If the second bay was taken while they paid (the no-overlap constraint
 * refuses to confirm it), its share is refunded from the same payment, the
 * row is cancelled, and both the customer and Jerrod are told which bay they
 * still have. The first bay stays confirmed.
 *
 * Returns the bay names and money that the confirmation messages should show
 * for the whole group.
 */
interface GroupConfirmResult {
  childBayNames: string[]
  childSubtotal: number
  childMembershipDiscount: number
  childTotal: number
}

// Never throws. The webhook calls this after the parent row is already
// confirmed; an exception here would send Stripe a 500, its retry would find
// the parent no longer pending and skip every confirmation message, and the
// customer would hear nothing. So a failure is logged and alerted instead,
// and the single-bay messages still go out.
export async function confirmGroupChildren(
  db: SupabaseClient,
  parent: { id: string; user_id: string; starts_at: string; ends_at: string },
  paymentIntentId: string,
): Promise<GroupConfirmResult> {
  try {
    return await confirmGroupChildrenUnsafe(db, parent, paymentIntentId)
  } catch (err) {
    try {
      await logFailure(db, "booking-group-confirm-FAILED",
        `parent=${parent.id} pi=${paymentIntentId} err=${String(err).slice(0, 200)}`,
        `A paid two-bay booking's second bay may not have confirmed (booking ${parent.id}). Check it by hand.`)
    } catch { /* best effort */ }
    return { childBayNames: [], childSubtotal: 0, childMembershipDiscount: 0, childTotal: 0 }
  }
}

async function confirmGroupChildrenUnsafe(
  db: SupabaseClient,
  parent: { id: string; user_id: string; starts_at: string; ends_at: string },
  paymentIntentId: string,
): Promise<GroupConfirmResult> {
  const empty = { childBayNames: [], childSubtotal: 0, childMembershipDiscount: 0, childTotal: 0 }
  const { data: kids } = await db
    .from("bookings")
    .select("id, total, subtotal, membership_discount, bays(name)")
    .eq("parent_booking_id", parent.id)
    .eq("status", "pending")
  const children = (kids ?? []) as { id: string; total: number; subtotal: number; membership_discount: number; bays: { name: string } | null }[]
  if (children.length === 0) return empty

  const result = { ...empty, childBayNames: [] as string[] }
  for (const child of children) {
    const { error } = await db.from("bookings")
      .update({ status: "confirmed", paid_at: new Date().toISOString() })
      .eq("id", child.id)
      .eq("status", "pending")

    if (!error) {
      result.childBayNames.push(child.bays?.name ?? "")
      result.childSubtotal += Number(child.subtotal ?? 0)
      result.childMembershipDiscount += Number(child.membership_discount ?? 0)
      result.childTotal += Number(child.total ?? 0)
      continue
    }

    // Anything but "slot taken" is treated like the parent's own transient
    // error: leave it pending and shout, rather than refund on a guess.
    if (error.code !== "23P01") {
      await logFailure(db, "booking-group-child-confirm-db-error",
        `child=${child.id} parent=${parent.id} code=${error.code} err=${String(error.message).slice(0, 200)}`,
        `Second bay of a paid two-bay booking did not confirm (database error). Check booking ${child.id} by hand.`)
      continue
    }

    let refunded = false
    const cents = Math.round(Number(child.total ?? 0) * 100)
    try {
      if (cents > 0) {
        await getStripe().refunds.create({ payment_intent: paymentIntentId, amount: cents })
      }
      refunded = true
    } catch (err) {
      await logFailure(db, "booking-group-child-REFUND-FAILED",
        `child=${child.id} pi=${paymentIntentId} err=${String(err).slice(0, 200)}`,
        `URGENT: the second bay of a two-bay booking was taken while they paid and the $${Number(child.total).toFixed(2)} refund FAILED. Refund it by hand in Stripe (${paymentIntentId}).`)
    }
    await db.from("bookings").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      ...(refunded ? { refund_amount: child.total, refunded_at: new Date().toISOString() } : {}),
    }).eq("id", child.id)

    const stillConfirmed = await getStillConfirmedBayNames(db, parent.user_id, parent.starts_at, parent.ends_at)
    await notifyOwner(
      `${child.bays?.name ?? "The second bay"} of a two-bay booking was taken while the customer paid. ` +
      `${refunded ? `Its $${Number(child.total).toFixed(2)} was refunded automatically` : "Refund FAILED, do it by hand"}. ` +
      `They still have ${bayLabel(stillConfirmed) || "their first bay"}.`,
    )
    const { data: profile } = await db.from("profiles").select("first_name, phone, sms_consent").eq("id", parent.user_id).single()
    const p = profile as { first_name: string; phone: string | null; sms_consent: boolean } | null
    if (p?.phone && p.sms_consent && child.bays) {
      try {
        await sendBookingPaymentFailedSms({
          to: p.phone, firstName: p.first_name, bayName: child.bays.name,
          startsAt: new Date(parent.starts_at), stillConfirmedBayNames: stillConfirmed,
        })
      } catch (e) {
        await logFailure(db, "booking-group-child-lost-sms-FAILED", `child=${child.id} err=${String(e).slice(0, 200)}`)
      }
    }
  }
  return result
}
