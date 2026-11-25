import Stripe from "stripe"
import { revokeBookingAccess, reissueBookingAccessForNewWindow } from "@/lib/access-control/booking-access"
import { restoreHourCredits } from "@/lib/hour-credits"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { sendBookingCancellationSms, sendBookingRescheduledSms } from "@/lib/telnyx/sms"
import { sendBookingCancellationEmail, sendBookingRescheduledEmail } from "@/lib/resend/email"
import { calculateBookingPrice, getPricingContext, type BookingPrice } from "@/lib/pricing/engine"
import { getVeteranDiscountPercent } from "@/lib/pricing/veteran"
import { isInFirstYear } from "@/lib/membership/first-year"
import { holdsBayFilter } from "@/lib/bookings/pending-hold"
import { bayLabel, groupChargeIds, refundAcrossCharges, type GroupRow } from "@/lib/bookings/group"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Changing a two-bay booking after it is paid (2026-11-20, Jerrod):
 * - cancel ONE bay: that bay's share comes back from the one payment (same
 *   24-hour rule as any booking); the other bay becomes a normal booking.
 * - reschedule: both bays move together to two side-by-side bays at the new
 *   time. One bay alone can't be moved (cancel it and book it separately).
 * - admin move: dragging either bay moves the pair; the other bay lands next
 *   to it.
 *
 * Money rules: the parent's stripe_charge_id is the booking payment; any
 * reschedule payment is added to the parent's extra_charge_ids. A refund is
 * always the live bays' totals (never a whole charge), drawn from those
 * charges in order, so a reschedule fee is never refunded and nothing is
 * refunded twice.
 */

export const GROUP_RESCHEDULE_FEE = 5.0

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
}

type Bay = { id: string; number: number; name: string }

async function profileOf(db: SupabaseClient, userId: string) {
  const { data } = await db.from("profiles").select("first_name, phone, sms_consent").eq("id", userId).single()
  return data as { first_name: string; phone: string | null; sms_consent: boolean } | null
}

// ── Cancel one bay ───────────────────────────────────────────────────────────

/**
 * Cancels one bay of a live two-bay booking. Returns null when it is not a
 * live pair (caller should fall back to cancelling the whole booking).
 */
export async function cancelOneBayOfGroup(
  db: SupabaseClient,
  group: GroupRow[],
  bookingId: string,
  { actorId, refundEligible }: { actorId: string; refundEligible: boolean },
): Promise<{ refundAmount: number; creditHoursRestored: number } | null> {
  const parent = group[0]
  const live = group.filter((g) => g.status !== "cancelled")
  const target = live.find((g) => g.id === bookingId)
  const other = live.find((g) => g.id !== bookingId)
  if (!target || !other || live.length !== 2 || parent.status !== "confirmed") return null

  // Refund first: if Stripe fails, nothing changes and they can try again.
  let refundCents = 0
  if (refundEligible && Number(target.total) > 0) {
    refundCents = await refundAcrossCharges(groupChargeIds(parent), Math.round(Number(target.total) * 100))
  }
  const refundAmount = refundCents / 100
  const now = new Date().toISOString()

  await db.from("bookings").update({
    status: "cancelled",
    cancelled_at: now,
    cancelled_by: actorId,
    refund_amount: refundAmount,
    refunded_at: refundCents > 0 ? now : null,
  }).eq("id", target.id)
  await revokeBookingAccess(db, target.id)
  const creditHoursRestored = refundEligible ? await restoreHourCredits(db, target.id) : 0

  // The bay that is left becomes a normal one-bay booking.
  if (target.id === parent.id) {
    // It inherits the payment (the PI column is UNIQUE, so clear it first)
    // and gets its own door code; the cancelled row's code is gone.
    await db.from("bookings").update({ stripe_payment_intent_id: null, stripe_charge_id: null, extra_charge_ids: [] }).eq("id", parent.id)
    await db.from("bookings").update({
      parent_booking_id: null,
      stripe_payment_intent_id: parent.stripe_payment_intent_id,
      stripe_charge_id: parent.stripe_charge_id,
      extra_charge_ids: parent.extra_charge_ids ?? [],
    }).eq("id", other.id)
    await reissueBookingAccessForNewWindow(db, other.id)
  } else {
    await db.from("bookings").update({ parent_booking_id: null }).eq("id", target.id)
  }

  await logEvent(db, "booking-group-one-bay-cancelled",
    `cancelled=${target.id} kept=${other.id} by=${actorId} refund=${refundAmount.toFixed(2)}`)

  const p = await profileOf(db, parent.user_id)
  const bayName = target.bays?.name ?? "One bay"
  if (p?.phone && p.sms_consent) {
    try {
      await sendBookingCancellationSms({
        to: p.phone, firstName: p.first_name, bayName,
        startsAt: new Date(target.starts_at), endsAt: new Date(target.ends_at),
        refundAmount, creditHoursRestored,
      })
    } catch (e) {
      await logFailure(db, "booking-cancellation-sms-FAILED", `booking=${target.id} err=${String(e).slice(0, 200)}`)
    }
  }
  const { data: { user: authUser } } = await db.auth.admin.getUserById(parent.user_id)
  if (authUser?.email) {
    try {
      await sendBookingCancellationEmail({
        to: authUser.email, firstName: p?.first_name ?? "", bayName,
        startsAt: new Date(target.starts_at), endsAt: new Date(target.ends_at),
        refundAmount, creditHoursRestored,
      })
    } catch (e) {
      await logFailure(db, "booking-cancellation-email-FAILED", `booking=${target.id} err=${String(e).slice(0, 200)}`)
    }
  }
  return { refundAmount, creditHoursRestored }
}

// ── Free bays ────────────────────────────────────────────────────────────────

async function freeBays(db: SupabaseClient, start: Date, end: Date, excludeIds: string[]): Promise<Bay[]> {
  const { data: bays } = await db.from("bays").select("id, number, name").eq("active", true).order("number")
  const free: Bay[] = []
  for (const bay of (bays ?? []) as Bay[]) {
    let q = db.from("bookings").select("id").eq("bay_id", bay.id).or(holdsBayFilter())
      .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString())
    for (const id of excludeIds) q = q.neq("id", id)
    const [{ data: conflicts }, { data: blocked }] = await Promise.all([
      q,
      db.from("blocked_times").select("id").or(`bay_id.eq.${bay.id},bay_id.is.null`)
        .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()),
    ])
    if (!conflicts?.length && !blocked?.length) free.push(bay)
  }
  return free
}

/** Side-by-side free pairs at that time, the group's current pair first if it is free. */
async function freePairs(db: SupabaseClient, start: Date, end: Date, excludeIds: string[], currentBayIds: string[]): Promise<[Bay, Bay][]> {
  const free = await freeBays(db, start, end, excludeIds)
  const pairs: [Bay, Bay][] = []
  for (const a of free) {
    const b = free.find((x) => x.number === a.number + 1)
    if (b) pairs.push([a, b])
  }
  return pairs.sort((x, y) => {
    const score = (p: [Bay, Bay]) => p.filter((bay) => currentBayIds.includes(bay.id)).length
    return score(y) - score(x)
  })
}

/**
 * Which row goes to which bay of the new pair, and in which order to write
 * them, so the no-overlap rule never sees the two rows collide with each
 * other mid-move. Returns [first row + bay, second row + bay].
 */
function planMove<R extends { id: string; bay_id: string }>(rows: [R, R], pair: [string, string]): [[R, string], [R, string]] {
  const [r0, r1] = rows
  const [a, b] = pair
  // Keep a row on its own bay when that bay is part of the new pair.
  let t0: string, t1: string
  if (pair.includes(r0.bay_id) && pair.includes(r1.bay_id)) { t0 = r0.bay_id; t1 = r1.bay_id }
  else if (pair.includes(r1.bay_id)) { t1 = r1.bay_id; t0 = t1 === a ? b : a }
  else if (pair.includes(r0.bay_id)) { t0 = r0.bay_id; t1 = t0 === a ? b : a }
  else { t0 = a; t1 = b }
  // Write first the row whose target is not the other row's current bay.
  return t0 === r1.bay_id ? [[r1, t1], [r0, t0]] : [[r0, t0], [r1, t1]]
}

// ── Reschedule (customer) ────────────────────────────────────────────────────

type MoveRow = GroupRow & { bay_id: string; duration_minutes: number; credit_hours_applied: number | null }

async function loadLivePair(db: SupabaseClient, group: GroupRow[]): Promise<[MoveRow, MoveRow] | null> {
  const live = group.filter((g) => g.status !== "cancelled")
  if (live.length !== 2) return null
  const { data } = await db.from("bookings")
    .select("id, bay_id, duration_minutes, credit_hours_applied, extension_minutes, grounds_crew_minutes")
    .in("id", live.map((g) => g.id))
  const extra = new Map(((data ?? []) as { id: string }[]).map((r) => [r.id, r]))
  const rows = live.map((g) => ({ ...g, ...(extra.get(g.id) as object) })) as MoveRow[]
  return [rows[0], rows[1]]
}

export interface GroupQuote {
  pair: [Bay, Bay]
  newStart: Date
  newEnd: Date
  pricing: Map<string, BookingPrice>
  pricePerHour: number
  originalTotal: number
  newTotal: number
  delta: number
  netCharge: number
}

export async function quoteGroupReschedule(
  db: SupabaseClient,
  userId: string,
  group: GroupRow[],
  newStartsAt: string,
): Promise<{ ok: true; quote: GroupQuote; rows: [MoveRow, MoveRow] } | { ok: false; error: string; status: number }> {
  const rows = await loadLivePair(db, group)
  if (!rows) return { ok: false, status: 400, error: "This booking isn't a two-bay booking anymore. Refresh and try again." }
  if (rows.some((r) => Number((r as { extension_minutes?: number }).extension_minutes ?? 0) > 0)) {
    return { ok: false, status: 400, error: "This booking has extra time added to it, so it can't be moved online. Call us at (574) 444-9365 and we'll move it for you." }
  }
  if (rows.some((r) => Number((r as { grounds_crew_minutes?: number }).grounds_crew_minutes ?? 0) > 0)) {
    return { ok: false, status: 400, error: "Grounds Crew bookings can't be moved. Cancel this one and book the new time, it's still free." }
  }
  const hoursUntil = (new Date(rows[0].starts_at).getTime() - Date.now()) / 3600000
  if (hoursUntil <= 4) return { ok: false, status: 400, error: "Bookings within 4 hours cannot be rescheduled" }

  const durationMinutes = rows[0].duration_minutes
  const newStart = new Date(newStartsAt)
  const newEnd = new Date(newStart.getTime() + durationMinutes * 60000)
  if (newStart <= new Date()) return { ok: false, status: 400, error: "New time must be in the future" }

  const pairs = await freePairs(db, newStart, newEnd, rows.map((r) => r.id), rows.map((r) => r.bay_id))
  if (pairs.length === 0) {
    return { ok: false, status: 409, error: "Two side-by-side bays aren't open at that time. Pick another time." }
  }

  const { data: pricingRules } = await db.from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")
  const rulesMap: Record<string, number> = {}
  for (const rule of (pricingRules ?? []) as { season_type: string; day_type: string; time_type: string; price_per_hour: number }[]) {
    rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
  }
  const context = getPricingContext(newStart)
  const pricePerHour = rulesMap[`${context.seasonType}|${context.dayType}|${context.timeType}`] ?? 0

  const { data: membership } = await db.from("memberships")
    .select("started_at, year_one_discount_expires_at, membership_plans(discount_percent, first_year_discount)")
    .eq("user_id", userId).eq("status", "active").maybeSingle()
  let membershipDiscountPercent = 0
  const plan = (membership as { membership_plans?: { discount_percent: number; first_year_discount: number | null } } | null)?.membership_plans
  if (membership && plan) {
    membershipDiscountPercent = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null }) && plan.first_year_discount != null
      ? plan.first_year_discount : plan.discount_percent
  }
  const veteranDiscountPercent = await getVeteranDiscountPercent(db, userId)

  // Same as a one-bay reschedule: discounts re-applied at the new slot's rate,
  // free hours carried over (they only ever sit on the first bay), coupon and
  // gift card not re-applied.
  const pricing = new Map<string, BookingPrice>()
  for (const r of rows) {
    pricing.set(r.id, calculateBookingPrice({
      pricePerHour, durationMinutes, membershipDiscountPercent, veteranDiscountPercent, context,
      creditHours: Number(r.credit_hours_applied ?? 0),
    }))
  }
  const originalTotal = rows.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const newTotal = rows.reduce((s, r) => s + pricing.get(r.id)!.total, 0)
  const delta = parseFloat((newTotal - originalTotal).toFixed(2))
  const netCharge = parseFloat((delta + GROUP_RESCHEDULE_FEE).toFixed(2))
  return { ok: true, rows, quote: { pair: pairs[0], newStart, newEnd, pricing, pricePerHour, originalTotal, newTotal, delta, netCharge } }
}

/**
 * Applies a quoted group reschedule. With a payment, `chargeId` is claimed on
 * the parent first, so the return page and the Stripe webhook can both call
 * this and only one of them moves the booking.
 */
export async function applyGroupReschedule(
  db: SupabaseClient,
  userId: string,
  group: GroupRow[],
  newStartsAt: string,
  { chargeId }: { chargeId: string | null },
): Promise<{ applied: boolean }> {
  const parent = group[0]
  if (chargeId) {
    const { data: row } = await db.from("bookings").select("extra_charge_ids").eq("id", parent.id).single()
    const existing = ((row as { extra_charge_ids: string[] | null } | null)?.extra_charge_ids ?? [])
    if (existing.includes(chargeId)) return { applied: false }
    const { data: claimed } = await db.from("bookings")
      .update({ extra_charge_ids: [...existing, chargeId] })
      .eq("id", parent.id).not("extra_charge_ids", "cs", `{${chargeId}}`).select("id")
    if (!claimed?.length) return { applied: false }
  }

  const q = await quoteGroupReschedule(db, userId, group, newStartsAt)
  if (!q.ok) {
    if (chargeId) {
      // They paid but the bays were taken in the meantime: give the money back.
      try {
        const charge = await getStripe().charges.retrieve(chargeId)
        if (charge.amount - charge.amount_refunded > 0) await getStripe().refunds.create({ charge: chargeId })
      } catch (e) {
        await logFailure(db, "group-reschedule-REFUND-FAILED", `parent=${parent.id} charge=${chargeId} err=${String(e).slice(0, 200)}`,
          `URGENT: a two-bay reschedule was paid but could not be applied, and its refund FAILED. Refund charge ${chargeId} by hand.`)
      }
    }
    throw new Error(q.error)
  }
  const { quote, rows } = q

  // Customer is owed money (the new time is cheaper by more than the fee).
  if (quote.netCharge < 0) {
    await refundAcrossCharges(groupChargeIds(parent), Math.round(Math.abs(quote.netCharge) * 100))
  }

  const [[firstRow, firstBay], [secondRow, secondBay]] = planMove(rows, [quote.pair[0].id, quote.pair[1].id])
  for (const [row, bayId] of [[firstRow, firstBay], [secondRow, secondBay]] as [MoveRow, string][]) {
    const p = quote.pricing.get(row.id)!
    const { error } = await db.from("bookings").update({
      bay_id: bayId,
      starts_at: quote.newStart.toISOString(),
      ends_at: quote.newEnd.toISOString(),
      price_per_hour: quote.pricePerHour,
      subtotal: p.subtotal,
      membership_discount: p.membershipDiscount,
      veteran_discount: p.veteranDiscount,
      promo_discount: 0,
      coupon_discount: 0,
      gift_card_applied: 0,
      credit_hours_applied: p.creditHoursApplied,
      credit_discount: p.creditDiscount,
      tax: p.tax,
      total: p.total,
    }).eq("id", row.id)
    if (error) {
      await logFailure(db, "group-reschedule-FAILED", `row=${row.id} err=${String(error.message).slice(0, 200)}`,
        `A two-bay reschedule only half applied (booking ${parent.id}). Check both bays by hand.`)
      throw new Error("That time was just taken. Please choose another time.")
    }
  }
  await reissueBookingAccessForNewWindow(db, parent.id)
  await logEvent(db, "booking-group-rescheduled",
    `parent=${parent.id} to=${quote.newStart.toISOString()} bays=${quote.pair.map((b) => b.name).join("+")} net=${quote.netCharge}`)

  const p = await profileOf(db, parent.user_id)
  const names = bayLabel(quote.pair.map((b) => b.name))
  if (p?.phone && p.sms_consent) {
    try {
      await sendBookingRescheduledSms({ to: p.phone, firstName: p.first_name, bayName: names, startsAt: quote.newStart, endsAt: quote.newEnd })
    } catch (e) {
      await logFailure(db, "reschedule-sms-FAILED", `group=${parent.id} err=${String(e).slice(0, 200)}`)
    }
  }
  const { data: { user: authUser } } = await db.auth.admin.getUserById(parent.user_id)
  if (authUser?.email) {
    const all = [...quote.pricing.values()]
    const sum = (f: (x: BookingPrice) => number) => all.reduce((s, x) => s + f(x), 0)
    try {
      await sendBookingRescheduledEmail({
        to: authUser.email, firstName: p?.first_name ?? "", bayName: names,
        startsAt: quote.newStart, endsAt: quote.newEnd,
        subtotal: sum((x) => x.subtotal), membershipDiscount: sum((x) => x.membershipDiscount),
        couponDiscount: 0, tax: sum((x) => x.tax), giftCardApplied: 0,
        hourCreditDiscount: sum((x) => x.creditDiscount), total: quote.newTotal,
      })
    } catch (e) {
      await logFailure(db, "reschedule-email-FAILED", `group=${parent.id} err=${String(e).slice(0, 200)}`)
    }
  }
  return { applied: true }
}

// ── Admin move ───────────────────────────────────────────────────────────────

/**
 * Admin drag of either bay of a pair: the dragged bay goes where it was
 * dropped, the other bay lands next to it (same side as before if that bay is
 * free, otherwise the other side), both at the new time. Price stays the same,
 * like any admin move.
 */
export async function moveGroupByAdmin(
  db: SupabaseClient,
  group: GroupRow[],
  draggedId: string,
  newBayId: string,
  newStartsAt: string,
): Promise<{ bayNames: string[]; start: Date; end: Date; userId: string }> {
  const rows = await loadLivePair(db, group)
  if (!rows) throw new Error("This booking isn't a two-bay booking anymore. Refresh and try again.")
  const dragged = rows.find((r) => r.id === draggedId)
  const partner = rows.find((r) => r.id !== draggedId)
  if (!dragged || !partner) throw new Error("Booking not found")

  const lengthMs = new Date(dragged.ends_at).getTime() - new Date(dragged.starts_at).getTime()
  const start = new Date(newStartsAt)
  const end = new Date(start.getTime() + lengthMs)

  const { data: allBays } = await db.from("bays").select("id, number, name").eq("active", true)
  const byId = new Map(((allBays ?? []) as Bay[]).map((b) => [b.id, b]))
  const target = byId.get(newBayId)
  const dCur = byId.get(dragged.bay_id)
  const pCur = byId.get(partner.bay_id)
  if (!target || !dCur || !pCur) throw new Error("Bay not found")

  const free = await freeBays(db, start, end, rows.map((r) => r.id))
  // The dragged bay goes where Jerrod dropped it, even over a block (his call),
  // but never onto another booking.
  const { data: clash } = await db.from("bookings").select("id").eq("bay_id", newBayId).in("status", ["pending", "confirmed"])
    .neq("id", dragged.id).neq("id", partner.id)
    .lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString())
  if (clash?.length) throw new Error(`${target.name} is already booked at that time.`)

  const side = Math.sign(pCur.number - dCur.number) || 1
  const candidates = [target.number + side, target.number - side]
  const partnerBay = candidates.map((n) => free.find((b) => b.number === n)).find(Boolean)
  if (!partnerBay) {
    throw new Error(`There's no free bay next to ${target.name} at that time for the other half of this two-bay booking.`)
  }

  const want = new Map([[dragged.id, newBayId], [partner.id, partnerBay.id]])
  // Dropping one bay onto its partner's bay just swaps them: the pair is the
  // same two bays, so keep each row where it is and only change the time.
  if (newBayId === partner.bay_id && partnerBay.id === dragged.bay_id) {
    want.set(dragged.id, dragged.bay_id)
    want.set(partner.id, partner.bay_id)
  }
  // Write first the row whose new bay is not the other row's current bay, so
  // the no-overlap rule never sees the two rows collide mid-move.
  const ordered = want.get(dragged.id) === partner.bay_id ? [partner, dragged] : [dragged, partner]
  for (const row of ordered) {
    const { error } = await db.from("bookings").update({
      bay_id: want.get(row.id),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    }).eq("id", row.id)
    if (error) {
      await logFailure(db, "group-admin-move-FAILED", `row=${row.id} err=${String(error.message).slice(0, 200)}`,
        `A two-bay move only half applied (booking ${group[0].id}). Check both bays.`)
      throw new Error(`Could not move both bays: ${error.message}`)
    }
  }
  await reissueBookingAccessForNewWindow(db, group[0].id)
  await logEvent(db, "booking-group-admin-moved", `parent=${group[0].id} bays=${target.name}+${partnerBay.name} start=${start.toISOString()}`)
  return { bayNames: [target, partnerBay].sort((a, b) => a.number - b.number).map((b) => b.name), start, end, userId: group[0].user_id }
}
