import { randomBytes } from "crypto"
import Stripe from "stripe"
import { holdsBayFilter } from "@/lib/bookings/pending-hold"
import { revokeBookingAccess } from "@/lib/access-control/booking-access"
import { grantBayAccess, revokeBayAccess } from "@/lib/access-control"
import { DOOR_OPENS_EARLY_MINUTES } from "@/lib/access-control/constants"
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
  bay_price: number | null
  host_rate: number
  host_hours: number[]
  host_amount: number
  details: string
  blocked_time_ids: string[]
  door_pin: string | null
  door_user_id: string | null
  door_policy_id: string | null
  door_schedule_id: string | null
  door_revoked_at: string | null
  door_error: string | null
  code_sent_at: string | null
  host_reminded_at: string | null
}

/** Setup before and teardown after every event: bays held, door open. */
export const EVENT_BUFFER_MIN = 30
export const DEFAULT_HOST_RATE = 50
const CODE_SEND_BEFORE_MIN = 120

export { hostBlocks, hostAmountFor } from "./host"
import { hostBlocks, hostAmountFor } from "./host"

/** "6 to 7 PM, 8 to 9 PM" for the chosen host blocks, contiguous ones merged. */
export function hostLabel(startsAt: string, durationMinutes: number, chosen: number[]): string {
  const t = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/Indiana/Indianapolis", hour: "numeric", minute: "2-digit" }).replace(":00", "")
  const start = new Date(startsAt).getTime()
  const runs: { from: number; to: number }[] = []
  for (const b of hostBlocks(durationMinutes).filter((x) => chosen.includes(x.offset))) {
    const last = runs[runs.length - 1]
    if (last && last.to === b.offset) last.to = b.offset + b.minutes
    else runs.push({ from: b.offset, to: b.offset + b.minutes })
  }
  return runs.map((r) => `${t(new Date(start + r.from * 60000))} to ${t(new Date(start + r.to * 60000))}`).join(", ")
}

export const durationOf = (e: Pick<EventRow, "starts_at" | "ends_at">) => Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000)
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
  bayPrice: number
  hostRate: number
  hostHours: number[]
  details: string
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
  const bayPrice = Math.round(Number(input.bayPrice) * 100) / 100
  if (!(bayPrice > 0)) return { ok: false, error: "Enter the agreed price for the bays." }
  const hostRate = Math.round(Number(input.hostRate || DEFAULT_HOST_RATE) * 100) / 100
  const validOffsets = hostBlocks(dur).map((b) => b.offset)
  const hostHours = [...new Set(input.hostHours.map(Number))].filter((o) => validOffsets.includes(o)).sort((a, b) => a - b)
  if (hostHours.length && !(hostRate > 0)) return { ok: false, error: "Set the host rate." }
  const hostAmount = hostHours.length ? hostAmountFor(hostRate, hostHours, dur) : 0
  const price = Math.round((bayPrice + hostAmount) * 100) / 100
  const deposit = input.depositAmount === null ? null : Math.round(Number(input.depositAmount) * 100) / 100
  if (deposit !== null && !(deposit > 0 && deposit < price)) return { ok: false, error: "The deposit has to be more than $0 and less than the total." }
  if (deposit !== null && !input.balanceDue) return { ok: false, error: "Set when the balance is due." }

  const [hh, mm] = input.startTime.split(":").map(Number)
  const startsAt = easternWallToUtc(input.date, hh * 60 + mm)
  const endsAt = new Date(startsAt.getTime() + dur * 60000)
  if (startsAt.getTime() < Date.now()) return { ok: false, error: "That start time has already passed." }

  // Bays free, including the setup and teardown buffers? Same test the manual
  // booking uses: confirmed bookings, live checkout holds, and blocked time.
  const holdFrom = new Date(startsAt.getTime() - EVENT_BUFFER_MIN * 60000)
  const holdTo = new Date(endsAt.getTime() + EVENT_BUFFER_MIN * 60000)
  const { data: clashing } = await db.from("bookings").select("bay_id, bays(name)")
    .in("bay_id", bayIds).lt("starts_at", holdTo.toISOString()).gt("ends_at", holdFrom.toISOString()).or(holdsBayFilter())
  if ((clashing ?? []).length) {
    const names = [...new Set((clashing as { bays: { name: string } | null }[]).map((c) => c.bays?.name ?? "a bay"))]
    return { ok: false, error: `Already booked at that time (including 30 minutes either side for setup and teardown): ${names.join(", ")}.` }
  }
  const { data: blocks } = await db.from("blocked_times").select("bay_id, reason")
    .lt("starts_at", holdTo.toISOString()).gt("ends_at", holdFrom.toISOString())
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
    price_total: price, deposit_amount: deposit, bay_price: bayPrice,
    host_rate: hostRate, host_hours: hostHours, host_amount: hostAmount, details: cleanLines(input.details),
    pay_by: input.payBy || null, balance_due: deposit !== null ? input.balanceDue : null,
    notes: input.notes.trim() || null, created_by: adminId,
  }).select("*").single()
  if (evErr || !ev) return { ok: false, error: "Couldn't save the event: " + (evErr?.message ?? "unknown error") }
  const event = ev as EventRow

  // One booking per bay. The bay price (not the host) is spread across the
  // bays so revenue reports add up; the first bay is the parent.
  const hours = dur / 60
  const share = Math.round((bayPrice / bayIds.length) * 100) / 100
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

  // Setup and teardown: the 30 minutes either side are held from regular bookings.
  const { data: buf, error: bufErr } = await db.from("blocked_times").insert(bayIds.flatMap((bay_id) => [
    { bay_id, starts_at: holdFrom.toISOString(), ends_at: startsAt.toISOString(), reason: `Event setup: ${title}`, created_by: adminId },
    { bay_id, starts_at: endsAt.toISOString(), ends_at: holdTo.toISOString(), reason: `Event teardown: ${title}`, created_by: adminId },
  ])).select("id")
  if (bufErr) await logFailure(db, "event-buffer-FAILED", `event=${event.id} err=${bufErr.message}`, `Event "${title}" was created but its 30-minute setup/teardown holds failed. Block them by hand on the calendar.`)
  else await db.from("events").update({ blocked_time_ids: ((buf ?? []) as { id: string }[]).map((b) => b.id) }).eq("id", event.id)

  await logEvent(db, "event-created", `event=${event.id} title=${title} bays=${bayIds.length} bayPrice=${bayPrice} host=${hostAmount} deposit=${deposit ?? "none"}`)
  if (input.sendLink) await sendPaymentLink(db, event, "new")
  return { ok: true, id: event.id, url: eventUrl(event.token) }
}

/** One item per line, bullets stripped, at most 20 lines. */
export function cleanLines(raw: string): string {
  return String(raw ?? "").split(/\r?\n/).map((l) => l.replace(/^[\s\-*\u2022]+/, "").trim()).filter(Boolean).slice(0, 20).map((l) => l.slice(0, 140)).join("\n")
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
          `${e.title}: ${whenLabel(e.starts_at, e.ends_at)}, ${bays.length === 1 ? bays[0] : `${bays.length} bays (${bays.join(", ")})`}, at Tee365, 4615 Grape Rd, Mishawaka. Doors open 30 minutes early for setup.`,
          Number(e.host_amount) > 0
            ? `Bays ${money(e.bay_price ?? Number(e.price_total) - Number(e.host_amount))} + host ${hostLabel(e.starts_at, durationOf(e), e.host_hours)} ${money(e.host_amount)} = total ${money(e.price_total)}. ${due}`
            : `Total: ${money(e.price_total)}. ${due}`,
          "Your event page has every detail, and your door code about 2 hours before the start. Questions? Call (574) 444-9365.",
        ],
        ctaText: opts[0].kind === "deposit" ? `See your event and pay the ${money(opts[0].amount)} deposit` : `See your event and pay ${money(opts[0].amount)}`,
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
  if (e.sms_ok && e.contact_phone) {
    const left = Math.max(0, Number(e.price_total) - Number(e.amount_paid))
    try {
      await sendEventText({ to: e.contact_phone, kind: "event-payment-received",
        body: `Tee365: thanks, we received ${money(amount)} for ${e.title}. ${left > 0 ? `${money(left)} left to pay${e.balance_due ? ` by ${dateLabel(e.balance_due)}` : ""}: ${eventUrl(e.token).replace("https://", "")}` : "You're paid in full. See you there!"}` })
    } catch (err) {
      await logFailure(db, "event-receipt-sms-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`)
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
  const { data: before } = await db.from("events").select("*").eq("id", eventId).single()
  const ev = before as EventRow
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
  if (ev?.blocked_time_ids?.length) await db.from("blocked_times").delete().in("id", ev.blocked_time_ids)
  if (ev?.door_user_id && !ev.door_revoked_at) {
    try {
      await revokeBayAccess(ev.door_user_id, ev.door_policy_id, ev.door_schedule_id)
      await db.from("events").update({ door_revoked_at: new Date().toISOString() }).eq("id", eventId)
    } catch (e) {
      await logFailure(db, "event-door-revoke-FAILED", `event=${eventId} err=${String(e).slice(0, 200)}`, `Cancelled event "${ev.title}": its door code could NOT be deleted. Delete user "Event ${ev.title.slice(0, 30)}" in UniFi.`)
    }
  }
  await recomputeEvent(db, eventId)
  await logEvent(db, "event-cancelled", `event=${eventId} refunded=${refunded} failed=${failed}`)

  // Tell the customer, with exactly what was refunded.
  if (ev && ev.status !== "cancelled") {
    const first = ev.contact_name.split(" ")[0]
    const money_ = refunded > 0 ? `We've refunded ${money(refunded)} to your card; it usually shows in 5 to 10 days.` : Number(ev.amount_paid) > 0 ? "No refund was issued with this cancellation. If that's unexpected, give us a call." : ""
    if (ev.contact_email) {
      try {
        await sendFounderMessage({
          to: ev.contact_email, firstName: first, kind: "event-cancelled",
          subject: `Cancelled: ${ev.title}`, heading: "Your event has been cancelled",
          paragraphs: [`${ev.title} on ${whenLabel(ev.starts_at, ev.ends_at)} has been cancelled, and the bays have been released.`, money_, "Questions? Call (574) 444-9365."].filter(Boolean),
        })
      } catch (e) {
        await logFailure(db, "event-cancel-email-FAILED", `event=${eventId} err=${String(e).slice(0, 200)}`)
      }
    }
    if (ev.sms_ok && ev.contact_phone) {
      try {
        await sendEventText({ to: ev.contact_phone, kind: "event-cancelled",
          body: `Hi ${first}, it's Tee365. ${ev.title} on ${whenLabel(ev.starts_at, ev.ends_at)} has been cancelled.${refunded > 0 ? ` ${money(refunded)} has been refunded to your card (5 to 10 days).` : ""} Questions: (574) 444-9365` })
      } catch (e) {
        await logFailure(db, "event-cancel-sms-FAILED", `event=${eventId} err=${String(e).slice(0, 200)}`)
      }
    }
  }
  return { refunded, failed }
}

// ---------------------------------------------------------------- event door code

export type EventDoorStep = "grant" | "send" | "revoke"

/**
 * One door code per event, working from 30 minutes before the start to 30
 * minutes after the end. Created the day before, sent 2 hours before (by
 * email, and text if they're OK with texts), deleted after. Event bookings
 * never get the normal per-booking code (booking-reminders skips them).
 * Pure, for testing.
 */
export function dueEventDoorSteps(e: Pick<EventRow, "status" | "starts_at" | "ends_at" | "door_user_id" | "door_pin" | "door_revoked_at" | "code_sent_at">, now: Date): EventDoorStep[] {
  const t = now.getTime(), start = new Date(e.starts_at).getTime(), end = new Date(e.ends_at).getTime()
  const granted = Boolean(e.door_user_id || e.door_pin), revoked = Boolean(e.door_revoked_at)
  const closes = end + EVENT_BUFFER_MIN * 60000
  if (granted && !revoked && (e.status === "cancelled" || t >= closes + 15 * 60000)) return ["revoke"]
  const out: EventDoorStep[] = []
  if (e.status !== "cancelled" && !granted && t >= start - 24 * 3600000 && t < closes) out.push("grant")
  if (e.status !== "cancelled" && !e.code_sent_at && t >= start - CODE_SEND_BEFORE_MIN * 60000 && t < closes) out.push("send")
  return out
}

function doorText(e: EventRow): string {
  const tz = "America/Indiana/Indianapolis"
  const t = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
  return `Door code: ${e.door_pin}. It works from ${t(new Date(e.starts_at).getTime() - EVENT_BUFFER_MIN * 60000)} to ${t(new Date(e.ends_at).getTime() + EVENT_BUFFER_MIN * 60000)}.`
}

export async function runEventDoors(db: SupabaseClient, now: Date): Promise<string[]> {
  const { data } = await db.from("events").select("*")
    .lt("starts_at", new Date(now.getTime() + 2 * 86400000).toISOString()).gt("ends_at", new Date(now.getTime() - 3 * 86400000).toISOString())
  const done: string[] = []
  for (const e0 of (data ?? []) as EventRow[]) {
    let e = e0
    for (const step of dueEventDoorSteps(e, now)) {
      try {
        if (step === "grant") {
          try {
            // grantBayAccess opens the door DOOR_OPENS_EARLY_MINUTES before startsAt.
            const g = await grantBayAccess({
              bookingId: `event-${e.id}`, firstName: "Event", lastName: e.title.slice(0, 30), phone: "", bayName: "Event",
              startsAt: new Date(new Date(e.starts_at).getTime() - (EVENT_BUFFER_MIN - DOOR_OPENS_EARLY_MINUTES) * 60000),
              endsAt: new Date(new Date(e.ends_at).getTime() + EVENT_BUFFER_MIN * 60000),
              // Already buffered, and doorText tells the host exactly when it stops.
              graceAfterEndMinutes: 0,
            })
            const { data: upd } = await db.from("events").update({ door_pin: g.pinCode, door_user_id: g.userId, door_policy_id: g.accessPolicyId, door_schedule_id: g.scheduleId, door_granted_at: new Date().toISOString(), door_error: null }).eq("id", e.id).select("*").single()
            e = upd as EventRow
          } catch (err) {
            if (!e.door_error) await notifyOwner(`Door code for event "${e.title}" could NOT be created (UniFi error). Retrying every 15 minutes.`)
            await db.from("events").update({ door_error: String(err).slice(0, 300) }).eq("id", e.id)
            throw err
          }
        }
        if (step === "send") {
          if (!e.door_pin) continue // no code yet; retried next run
          const first = e.contact_name.split(" ")[0]
          let ok = false
          if (e.contact_email) {
            try {
              await sendFounderMessage({ to: e.contact_email, firstName: first, kind: "event-door-code", subject: `Door code for ${e.title}`, heading: "Your door code",
                paragraphs: [`${e.title}, ${whenLabel(e.starts_at, e.ends_at)}.`, doorText(e), "Tee365, 4615 Grape Rd, Mishawaka. Enjoy!"], ctaText: "Your event details", ctaUrl: eventUrl(e.token) })
              ok = true
            } catch (err) { await logFailure(db, "event-code-email-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`) }
          }
          if (e.sms_ok && e.contact_phone) {
            try {
              await sendEventText({ to: e.contact_phone, kind: "event-door-code", body: `Tee365: ${e.title} today. ${doorText(e)} 4615 Grape Rd, Mishawaka.` })
              ok = true
            } catch (err) { await logFailure(db, "event-code-sms-FAILED", `event=${e.id} err=${String(err).slice(0, 200)}`) }
          }
          if (ok) await db.from("events").update({ code_sent_at: new Date().toISOString() }).eq("id", e.id)
          else await notifyOwner(`Door code for event "${e.title}" could NOT be sent to ${e.contact_name}. Code: ${e.door_pin}. Send it by hand.`)
        }
        if (step === "revoke") {
          try {
            if (e.door_user_id) await revokeBayAccess(e.door_user_id, e.door_policy_id, e.door_schedule_id)
            await db.from("events").update({ door_revoked_at: new Date().toISOString(), door_error: null }).eq("id", e.id)
          } catch (err) {
            if (!e.door_error) await notifyOwner(`Door code for event "${e.title}" could NOT be deleted; it would keep working weekly. Retrying; delete user "Event ${e.title.slice(0, 30)}" in UniFi if it repeats.`)
            await db.from("events").update({ door_error: String(err).slice(0, 300) }).eq("id", e.id)
            throw err
          }
        }
        done.push(`event-${step} ${e.id}`)
      } catch (err) {
        await logFailure(db, `event-door-${step}-FAILED`, `event=${e.id} err=${String(err).slice(0, 300)}`)
      }
    }
  }
  return done
}
