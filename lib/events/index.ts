import { randomBytes } from "crypto"
import Stripe from "stripe"
import { holdsBayFilter } from "@/lib/bookings/pending-hold"
import { revokeBookingAccess } from "@/lib/access-control/booking-access"
import { sendFounderMessage } from "@/lib/resend/email"
import { sendEventText } from "@/lib/telnyx/sms"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Private events (decided 2026-10-11). Jerrod agrees a price for one or more
 * bays, creates the event in /admin/events, and the customer pays through a
 * link that never expires (tee365.org/event/<token>): a deposit then the
 * balance, or the whole amount. Each bay is an ordinary CONFIRMED booking
 * linked by event_id, the first bay the parent and the rest its children
 * (the two-bay pattern), so the calendar, the one door code listing every bay,
 * bay power and the no-overlap rule all work unchanged. Bays are held from the
 * moment the event is created; nothing auto-cancels. Missed payment dates
 * alert Jerrod, who decides.
 */
export type EventStatus = "awaiting_payment" | "deposit_paid" | "paid" | "cancelled"
export interface EventRow {
  id: string
  token: string
  title: string
  user_id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  sms_ok: boolean
  starts_at: string
  ends_at: string
  bay_ids: string[]
  price_total: number
  deposit_amount: number | null
  pay_by: string | null
  balance_due: string | null
  amount_paid: number
  status: EventStatus
  notes: string | null
}
export type PayKind = "deposit" | "balance" | "full"

const BUSINESS_TZ = "America/Indiana/Indianapolis"
export const money = (n: number) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`
export const eventUrl = (token: string) => `https://tee365.org/event/${token}`

/** A wall-clock time in Eastern on a YYYY-MM-DD date, as a UTC instant (DST-safe). */
export function easternWallToUtc(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number)
  const h = Math.floor(minutes / 60), mi = minutes % 60
  for (const off of [4, 5]) {
    const c = new Date(Date.UTC(y, m - 1, d, h + off, mi))
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(c)
    const g = (t: string) => parts.find((p) => p.type === t)?.value
    if (`${g("year")}-${g("month")}-${g("day")}` === dateKey && Number(g("hour")) === h && Number(g("minute")) === mi) return c
  }
  return new Date(Date.UTC(y, m - 1, d, h + 5, mi))
}

export function whenLabel(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt), e = new Date(endsAt)
  const day = s.toLocaleDateString("en-US", { timeZone: BUSINESS_TZ, weekday: "long", month: "long", day: "numeric" })
  const t = (x: Date) => x.toLocaleTimeString("en-US", { timeZone: BUSINESS_TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "")
  return `${day}, ${t(s)} to ${t(e)}`
}
const dateLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })

/** What the customer can pay right now. Pure, for the pay page and the API. */
export function payOptions(e: Pick<EventRow, "status" | "price_total" | "deposit_amount" | "amount_paid">): { kind: PayKind; amount: number }[] {
  if (e.status === "cancelled") return []
  const total = Number(e.price_total), paid = Number(e.amount_paid)
  const remaining = Math.round((total - paid) * 100) / 100
  if (remaining <= 0) return []
  if (paid === 0 && e.deposit_amount) return [{ kind: "deposit", amount: Number(e.deposit_amount) }, { kind: "full", amount: total }]
  return [{ kind: paid > 0 ? "balance" : "full", amount: remaining }]
}

export function statusFor(total: number, paid: number): EventStatus {
  if (paid >= total) return "paid"
  return paid > 0 ? "deposit_paid" : "awaiting_payment"
}

// ---------------------------------------------------------------- create

export interface NewEventInput {
  title: string
  firstName: string
  lastName: string
  phone: string
  email: string
  smsOk: boolean
  date: string          // YYYY-MM-DD
  startTime: string     // HH:MM, Eastern
  durationMinutes: number
  bayIds: string[]
  priceTotal: number
  depositAmount: number | null
  payBy: string | null
  balanceDue: string | null
  notes: string
  sendLink: boolean
}

export async function createEvent(db: SupabaseClient, input: NewEventInput, adminId: string): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  const title = input.title.trim()
  const firstName = input.firstName.trim(), lastName = input.lastName.trim()
  const email = input.email.trim().toLowerCase()
  if (!title) return { ok: false, error: "Give the event a name." }
  if (!firstName || !lastName) return { ok: false, error: "Customer first and last name are required." }
  const digits = input.phone.replace(/\D/g, "")
  const phone = digits.length === 10 ? "+1" + digits : digits.length === 11 && digits.startsWith("1") ? "+" + digits : ""
  if (!phone) return { ok: false, error: "Enter a 10-digit US phone number." }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That email doesn't look right." }
  if (!email && !input.smsOk) return { ok: false, error: "Add an email, or tick that they're OK with texts. Otherwise they can't get the payment link or their door code." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime)) return { ok: false, error: "Pick a date and start time." }
  const dur = Number(input.durationMinutes)
  if (!dur || dur < 60 || dur > 12 * 60 || dur % 30 !== 0) return { ok: false, error: "Length must be 1 to 12 hours, in half-hour steps." }
  const bayIds = [...new Set(input.bayIds)]
  if (!bayIds.length) return { ok: false, error: "Pick at least one bay." }
  const price = Math.round(Number(input.priceTotal) * 100) / 100
  if (!(price > 0)) return { ok: false, error: "Enter the agreed price." }
  const deposit = input.depositAmount === null ? null : Math.round(Number(input.depositAmount) * 100) / 100
  if (deposit !== null && !(deposit > 0 && deposit < price)) return { ok: false, error: "The deposit has to be more than $0 and less than the total." }
  if (deposit !== null && !input.balanceDue) return { ok: false, error: "Set when the balance is due." }

  const [hh, mm] = input.startTime.split(":").map(Number)
  const startsAt = easternWallToUtc(input.date, hh * 60 + mm)
  const endsAt = new Date(startsAt.getTime() + dur * 60000)
  if (startsAt.getTime() < Date.now()) return { ok: false, error: "That start time has already passed." }

  // Bays free? Same test the manual booking uses: confirmed bookings, live
  // checkout holds, and blocked time (league nights, maintenance).
  const { data: clashing } = await db.from("bookings").select("bay_id, bays(name)")
    .in("bay_id", bayIds).lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).or(holdsBayFilter())
  if ((clashing ?? []).length) {
    const names = [...new Set((clashing as { bays: { name: string } | null }[]).map((c) => c.bays?.name ?? "a bay"))]
    return { ok: false, error: `Already booked at that time: ${names.join(", ")}.` }
  }
  const { data: blocks } = await db.from("blocked_times").select("bay_id, reason")
    .lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString())
  const blocked = ((blocks ?? []) as { bay_id: string | null; reason: string | null }[]).filter((b) => b.bay_id === null || bayIds.includes(b.bay_id))
  if (blocked.length) return { ok: false, error: `That time is blocked${blocked[0].reason ? ` (${blocked[0].reason})` : ""}.` }

  // Customer: their existing account if the phone matches, else a new one.
  let userId: string
  const { data: existing } = await db.from("profiles").select("id").eq("phone", phone).maybeSingle()
  if (existing) userId = (existing as { id: string }).id
  else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      ...(email ? { email, email_confirm: true } : {}), phone, phone_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })
    if (createErr || !created?.user) return { ok: false, error: "Could not create the customer account: " + (createErr?.message ?? "unknown error") }
    userId = created.user.id
    await db.from("profiles").update({ phone, first_name: firstName, last_name: lastName }).eq("id", userId)
  }
  // They told Jerrod texts are fine: record it, so the door code (sent by the
  // booking-reminders cron, which checks sms_consent) reaches them by text too.
  if (input.smsOk) {
    await db.from("profiles").update({ sms_consent: true }).eq("id", userId)
    await logEvent(db, "event-sms-consent-recorded", `user=${userId} by=${adminId}`)
  }

  const { data: ev, error: evErr } = await db.from("events").insert({
    token: randomBytes(18).toString("base64url"), title, user_id: userId,
    contact_name: `${firstName} ${lastName}`, contact_phone: phone, contact_email: email || null, sms_ok: input.smsOk,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), bay_ids: bayIds,
    price_total: price, deposit_amount: deposit,
    pay_by: input.payBy || null, balance_due: deposit !== null ? input.balanceDue : null,
    notes: input.notes.trim() || null, created_by: adminId,
  }).select("*").single()
  if (evErr || !ev) return { ok: false, error: "Couldn't save the event: " + (evErr?.message ?? "unknown error") }
  const event = ev as EventRow

  // One booking per bay. The share of the price is spread across the bays so
  // revenue reports add up; the first bay is the parent (one door code).
  const hours = dur / 60
  const share = Math.round((price / bayIds.length) * 100) / 100
  const made: string[] = []
  for (const [i, bayId] of bayIds.entries()) {
    const { data: b, error } = await db.from("bookings").insert({
      user_id: userId, bay_id: bayId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      duration_minutes: dur, price_per_hour: Math.round((share / hours) * 100) / 100,
      subtotal: share, total: share, tax: 0, status: "confirmed", source: "admin",
      event_id: event.id, parent_booking_id: i === 0 ? null : made[0],
    }).select("id").single()
    if (error || !b) {
      // Undo everything: a half-made event is worse than none.
      if (made.length) await db.from("bookings").delete().in("id", made)
      await db.from("events").delete().eq("id", event.id)
      const taken = String(error?.message ?? "").includes("bookings_no_overlap")
      return { ok: false, error: taken ? "One of those bays was just booked by someone else. Pick again." : "Couldn't book the bays: " + (error?.message ?? "unknown error") }
    }
    made.push((b as { id: string }).id)
  }

  await logEvent(db, "event-created", `event=${event.id} title=${title} bays=${bayIds.length} price=${price} deposit=${deposit ?? "none"}`)
  if (input.sendLink) await sendPaymentLink(db, event, "new")
  return { ok: true, id: event.id, url: eventUrl(event.token) }
}

// ---------------------------------------------------------------- customer messages

/** The event's bays as booked now (a bay can be swapped on the calendar at the same time). */
export async function eventBayNames(db: SupabaseClient, eventId: string): Promise<string[]> {
  const { data } = await db.from("bookings").select("bays(name, number)").eq("event_id", eventId).neq("status", "cancelled")
  return ((data ?? []) as { bays: { name: string; number: number } | null }[])
    .map((b) => b.bays).filter((b): b is { name: string; number: number } => Boolean(b)).sort((x, y) => x.number - y.number).map((b) => b.name)
}

/** The payment link by email (and text if they agreed). kind "new" | "reminder". */
export async function sendPaymentLink(db: SupabaseClient, e: EventRow, kind: "new" | "reminder"): Promise<{ email: boolean; sms: boolean }> {
  const opts = payOptions(e)
  if (!opts.length) return { email: false, sms: false }
  const first = e.contact_name.split(" ")[0]
  const bays = await eventBayNames(db, e.id)
  const due = opts[0].kind === "deposit"
    ? `To lock it in, the ${money(opts[0].amount)} deposit is due${e.pay_by ? ` by ${dateLabel(e.pay_by)}` : ""}. The ${money(Number(e.price_total) - opts[0].amount)} balance is due by ${dateLabel(e.balance_due!)}. You can also pay it all at once.`
    : opts[0].kind === "balance"
      ? `Thanks for your deposit. The ${money(opts[0].amount)} balance is due${e.balance_due ? ` by ${dateLabel(e.balance_due)}` : ""}.`
      : `The ${money(opts[0].amount)} total is due${e.pay_by ? ` by ${dateLabel(e.pay_by)}` : ""}.`
  const sent = { email: false, sms: false }
  if (e.contact_email) {
    try {
      await sendFounderMessage({
        to: e.contact_email, firstName: first, kind: "event-payment-link",
        subject: kind === "new" ? `Your Tee365 event: ${e.title}` : `Reminder: payment for ${e.title}`,
        heading: kind === "new" ? "Your event is on the calendar" : "A quick reminder",
        paragraphs: [
          `${e.title}: ${whenLabel(e.starts_at, e.ends_at)}, ${bays.length === 1 ? bays[0] : `${bays.length} bays (${bays.join(", ")})`}, at Tee365, 4615 Grape Rd, Mishawaka.`,
          `Total: ${money(e.price_total)}. ${due}`,
          "Your door code comes shortly before the start. Questions? Call (574) 444-9365.",
        ],
        ctaText: opts[0].kind === "deposit" ? `Pay the ${money(opts[0].amount)} deposit` : `Pay ${money(opts[0].amount)}`,
        ctaUrl: eventUrl(e.token),
      })
      sent.email = true
    } catch (err) {
      await logFailure(db, "event-link-email-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`)
    }
  }
  if (e.sms_ok && e.contact_phone) {
    try {
      await sendEventText({
        to: e.contact_phone,
        body: `Hi ${first}, it's Jerrod at Tee365. ${kind === "new" ? "Your event is held" : "Reminder for your event"}: ${e.title}, ${whenLabel(e.starts_at, e.ends_at)}. ${due} Pay here: ${eventUrl(e.token).replace("https://", "")}\n- jerrod`,
        kind: `event-link-${kind}`,
      })
      sent.sms = true
    } catch (err) {
      await logFailure(db, "event-link-sms-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`)
    }
  }
  await logEvent(db, `event-link-${kind}`, `event=${e.id} email=${sent.email} sms=${sent.sms}`)
  return sent
}

// ---------------------------------------------------------------- payments

/** Re-add the payments, set status, mark the bookings paid once paid in full. */
export async function recomputeEvent(db: SupabaseClient, eventId: string): Promise<EventRow> {
  const { data: pays } = await db.from("event_payments").select("amount, status").eq("event_id", eventId)
  const paid = Math.round(((pays ?? []) as { amount: number; status: string }[]).filter((p) => p.status === "paid").reduce((t, p) => t + Number(p.amount), 0) * 100) / 100
  const { data: cur } = await db.from("events").select("*").eq("id", eventId).single()
  const e = cur as EventRow
  const status = e.status === "cancelled" ? "cancelled" : statusFor(Number(e.price_total), paid)
  // A new stage resets the reminder and alert flags for the next due date.
  const stageChanged = status !== e.status
  const { data: upd } = await db.from("events").update({
    amount_paid: paid, status, updated_at: new Date().toISOString(),
    ...(stageChanged ? { customer_reminded_at: null, owner_alerted_at: null } : {}),
  }).eq("id", eventId).select("*").single()
  if (status === "paid") await db.from("bookings").update({ paid_at: new Date().toISOString() }).eq("event_id", eventId).is("paid_at", null)
  return upd as EventRow
}

/** Stripe webhook: a payment for an event succeeded. Idempotent on the PaymentIntent. */
export async function recordStripeEventPayment(db: SupabaseClient, pi: { id: string; amount_received: number; metadata: Record<string, string> }): Promise<void> {
  const eventId = pi.metadata.event_id
  const kind = (["deposit", "balance", "full"].includes(pi.metadata.kind) ? pi.metadata.kind : "full") as PayKind
  const amount = pi.amount_received / 100
  const { error } = await db.from("event_payments").insert({ event_id: eventId, kind, amount, stripe_payment_intent_id: pi.id })
  if (error) {
    if ((error as { code?: string }).code === "23505") return // Stripe retried; already recorded
    await logFailure(db, "event-payment-record-FAILED", `event=${eventId} pi=${pi.id} err=${JSON.stringify(error).slice(0, 200)}`,
      `ALERT Event payment of ${money(amount)} RECEIVED but not recorded (pi ${pi.id}). Check /admin/events.`)
    return
  }
  const e = await recomputeEvent(db, eventId)
  const over = Math.round((Number(e.amount_paid) - Number(e.price_total)) * 100) / 100
  await notifyOwner(`Event paid: ${money(amount)} ${kind} from ${e.contact_name} for "${e.title}". ${money(e.amount_paid)} of ${money(e.price_total)} paid.${over > 0 ? ` OVERPAID by ${money(over)}: refund it on /admin/events.` : ""}`)
  if (e.contact_email) {
    const left = Math.max(0, Number(e.price_total) - Number(e.amount_paid))
    try {
      await sendFounderMessage({
        to: e.contact_email, firstName: e.contact_name.split(" ")[0], kind: "event-payment-received",
        subject: `Payment received: ${e.title}`, heading: "Thank you, payment received",
        paragraphs: [
          `We received ${money(amount)} for ${e.title} on ${whenLabel(e.starts_at, e.ends_at)}.`,
          left > 0 ? `${money(left)} is left to pay${e.balance_due ? `, due by ${dateLabel(e.balance_due)}` : ""}. Use the same link whenever you're ready.` : "You're paid in full. See you there!",
        ],
        ...(left > 0 ? { ctaText: `Pay the ${money(left)} balance`, ctaUrl: eventUrl(e.token) } : {}),
      })
    } catch (err) {
      await logFailure(db, "event-receipt-email-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`)
    }
  }
}

/** Cash, check or anything paid outside Stripe. */
export async function recordManualPayment(db: SupabaseClient, eventId: string, amount: number, note: string): Promise<void> {
  await db.from("event_payments").insert({ event_id: eventId, kind: "manual", amount, note: note || null })
  await recomputeEvent(db, eventId)
  await logEvent(db, "event-manual-payment", `event=${eventId} amount=${amount}`)
}

// ---------------------------------------------------------------- cancel

/** Cancels every bay, kills the door code, refunds the chosen Stripe payments. */
export async function cancelEvent(db: SupabaseClient, eventId: string, refundPaymentIds: string[]): Promise<{ refunded: number; failed: number }> {
  const { data: bookings } = await db.from("bookings").select("id, parent_booking_id, status").eq("event_id", eventId)
  for (const b of (bookings ?? []) as { id: string; parent_booking_id: string | null; status: string }[]) {
    if (b.status === "cancelled") continue
    await db.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", b.id)
    if (!b.parent_booking_id) {
      try { await revokeBookingAccess(db, b.id) } catch (e) { await logFailure(db, "event-cancel-revoke-FAILED", `booking=${b.id} err=${String(e).slice(0, 200)}`) }
    }
  }
  let refunded = 0, failed = 0
  if (refundPaymentIds.length) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
    const { data: pays } = await db.from("event_payments").select("id, amount, stripe_payment_intent_id, status").eq("event_id", eventId).in("id", refundPaymentIds)
    for (const p of (pays ?? []) as { id: string; amount: number; stripe_payment_intent_id: string | null; status: string }[]) {
      if (p.status !== "paid" || !p.stripe_payment_intent_id) continue
      try {
        await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id }, { idempotencyKey: `event-refund-${p.id}` })
        await db.from("event_payments").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", p.id)
        refunded += Number(p.amount)
      } catch (e) {
        failed++
        await logFailure(db, "event-refund-FAILED", `payment=${p.id} err=${String(e).slice(0, 200)}`,
          `ALERT Event refund of ${money(p.amount)} FAILED. Refund it by hand in Stripe.`)
      }
    }
  }
  await db.from("events").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", eventId)
  await recomputeEvent(db, eventId)
  await logEvent(db, "event-cancelled", `event=${eventId} refunded=${refunded} failed=${failed}`)
  return { refunded, failed }
}
