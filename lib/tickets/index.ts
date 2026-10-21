import Stripe from "stripe"
import { easternWallToUtc, money, whenLabel } from "@/lib/events"
import { grantBayAccess, revokeBayAccess } from "@/lib/access-control"
import { DOOR_OPENS_EARLY_MINUTES } from "@/lib/access-control/constants"
import { sendFounderMessage } from "@/lib/resend/email"
import { sendEventText } from "@/lib/telnyx/sms"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Ticketed parties (decided 2026-10-11): one big party for the whole room,
 * general admission tickets sold on /events, capped at the facility's 49
 * (adjustable). Jerrod runs the games and contests; this sells the tickets,
 * holds the bays and gets everyone through the door:
 *
 *   create   bays blocked for the window (from 30 minutes before the start)
 *   sell     reserve_ticket_order (SQL, atomic) holds tickets while a buyer is
 *            in Stripe Checkout (30 minutes), so the cap can't be oversold
 *   door     one code for the party, created a day before, sent to every buyer
 *            3 hours before the start (later buyers get it as they buy),
 *            deleted after the end (UniFi schedules repeat weekly)
 *   bays     switched on 15 minutes before the start, off at the end
 *
 * runParties does the door and bay steps from a cron every 15 minutes.
 */
export interface Party {
  id: string
  slug: string
  title: string
  description: string
  /** "Good to know" lines (food provided, bring a chair...), one per line. */
  details: string
  starts_at: string
  ends_at: string
  ticket_price: number
  capacity: number
  max_per_order: number
  sales_close_at: string | null
  bay_ids: string[]
  activities: { bay: string; label: string }[]
  published: boolean
  status: "on" | "cancelled"
  blocked_time_ids: string[]
  door_pin: string | null
  door_user_id: string | null
  door_policy_id: string | null
  door_schedule_id: string | null
  door_revoked_at: string | null
  door_error: string | null
  codes_sent_at: string | null
  bays_turned_on: string[]
  bays_on_at: string | null
  bays_off_at: string | null
}
export interface Order {
  id: string
  event_id: string
  name: string
  email: string
  phone: string | null
  sms_ok: boolean
  quantity: number
  amount: number
  status: "pending" | "paid" | "refunded" | "expired"
  stripe_payment_intent_id: string | null
  code_sent_at: string | null
  paid_at: string | null
  created_at: string
}

const HOLD_MINUTES = 35
const BLOCK_BEFORE_MIN = 30
const CODES_BEFORE_MIN = 180
const BAYS_ON_BEFORE_MIN = 15
const DOOR_GRANT_BEFORE_MIN = 24 * 60
export const partyUrl = (slug: string) => `https://tee365.org/parties/${slug}`

/** Sold (paid) and held (in checkout) ticket counts. */
export async function ticketCounts(db: SupabaseClient, eventId: string): Promise<{ sold: number; held: number }> {
  const { data } = await db.from("ticket_orders").select("quantity, status, created_at").eq("event_id", eventId).in("status", ["paid", "pending"])
  const cutoff = Date.now() - HOLD_MINUTES * 60000
  let sold = 0, held = 0
  for (const o of (data ?? []) as { quantity: number; status: string; created_at: string }[]) {
    if (o.status === "paid") sold += o.quantity
    else if (new Date(o.created_at).getTime() > cutoff) held += o.quantity
  }
  return { sold, held }
}

export function salesOpen(p: Pick<Party, "published" | "status" | "sales_close_at" | "starts_at">, now = new Date()): boolean {
  return p.published && p.status === "on" && now.getTime() < new Date(p.sales_close_at ?? p.starts_at).getTime()
}

/** One item per line, blanks and bullet characters dropped, at most 20 lines. */
export function cleanDetails(raw: string): string {
  return raw.split(/\r?\n/).map((l) => l.replace(/^[\s\-*\u2022]+/, "").trim()).filter(Boolean).slice(0, 20).map((l) => l.slice(0, 140)).join("\n")
}

function slugFor(title: string, startsAt: Date): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "party"
  return `${base}-${startsAt.toISOString().slice(0, 10)}`
}

// ---------------------------------------------------------------- admin: create / update

export interface NewParty {
  title: string
  description: string
  details: string
  date: string
  startTime: string
  endTime: string
  ticketPrice: number
  capacity: number
  maxPerOrder: number
  salesCloseMinutesBefore: number
  bayIds: string[]
  activities: { bay: string; label: string }[]
  published: boolean
}

export async function createParty(db: SupabaseClient, input: NewParty, adminId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim()
  if (!title) return { ok: false, error: "Give the party a name." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) return { ok: false, error: "Pick a date, start and end time." }
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const startsAt = easternWallToUtc(input.date, toMin(input.startTime))
  let endMin = toMin(input.endTime)
  if (endMin <= toMin(input.startTime)) endMin += 24 * 60 // ends after midnight
  const endsAt = new Date(startsAt.getTime() + (endMin - toMin(input.startTime)) * 60000)
  if (startsAt.getTime() < Date.now()) return { ok: false, error: "That start time has already passed." }
  const price = Math.round(Number(input.ticketPrice) * 100) / 100
  if (!(price > 0)) return { ok: false, error: "Set a ticket price." }
  const capacity = Math.floor(Number(input.capacity))
  if (!(capacity > 0)) return { ok: false, error: "Set the capacity." }
  const maxPer = Math.floor(Number(input.maxPerOrder))
  if (!(maxPer >= 1 && maxPer <= 20)) return { ok: false, error: "Tickets per order must be 1 to 20." }
  const bayIds = [...new Set(input.bayIds)]

  // The bays have to be free for the whole window, including setup time.
  const blockFrom = new Date(startsAt.getTime() - BLOCK_BEFORE_MIN * 60000)
  if (bayIds.length) {
    const { data: clash } = await db.from("bookings").select("starts_at, bays(name), profiles!user_id(first_name, last_name)")
      .in("bay_id", bayIds).eq("status", "confirmed").lt("starts_at", endsAt.toISOString()).gt("ends_at", blockFrom.toISOString())
    if ((clash ?? []).length) {
      const list = (clash as { starts_at: string; bays: { name: string } | null; profiles: { first_name: string; last_name: string } | null }[])
        .map((c) => `${c.bays?.name ?? "a bay"} (${c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name}` : "a customer"}, ${new Date(c.starts_at).toLocaleTimeString("en-US", { timeZone: "America/Indiana/Indianapolis", hour: "numeric", minute: "2-digit" })})`)
      return { ok: false, error: `Customers already have bookings in that window: ${list.join("; ")}. Move or cancel them first, or pick other bays.` }
    }
  }

  let slug = slugFor(title, startsAt)
  const { data: taken } = await db.from("ticketed_events").select("id").eq("slug", slug).maybeSingle()
  if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
  const salesClose = new Date(startsAt.getTime() - Math.max(0, Number(input.salesCloseMinutesBefore) || 0) * 60000)

  const { data: ev, error } = await db.from("ticketed_events").insert({
    slug, title, description: input.description.trim(), details: cleanDetails(input.details), starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    ticket_price: price, capacity, max_per_order: maxPer, sales_close_at: salesClose.toISOString(),
    bay_ids: bayIds, activities: input.activities.filter((a) => a.label.trim()).map((a) => ({ bay: a.bay, label: a.label.trim() })),
    published: input.published, created_by: adminId,
  }).select("id").single()
  if (error || !ev) return { ok: false, error: "Couldn't save the party: " + (error?.message ?? "unknown error") }
  const id = (ev as { id: string }).id

  // Hold the bays from regular bookings.
  if (bayIds.length) {
    const { data: blocks, error: bErr } = await db.from("blocked_times").insert(bayIds.map((bay_id) => ({
      bay_id, starts_at: blockFrom.toISOString(), ends_at: endsAt.toISOString(), reason: `Party: ${title}`, created_by: adminId,
    }))).select("id")
    if (bErr) {
      await db.from("ticketed_events").delete().eq("id", id)
      return { ok: false, error: "Couldn't block the bays: " + bErr.message }
    }
    await db.from("ticketed_events").update({ blocked_time_ids: ((blocks ?? []) as { id: string }[]).map((b) => b.id) }).eq("id", id)
  }
  await logEvent(db, "party-created", `party=${id} title=${title} price=${price} cap=${capacity}`)
  return { ok: true, id }
}

export async function updateParty(db: SupabaseClient, id: string, f: { title: string; description: string; details: string; ticketPrice: number; capacity: number; maxPerOrder: number; salesCloseAt: string; activities: { bay: string; label: string }[]; published: boolean }): Promise<{ ok: boolean; error?: string }> {
  const price = Math.round(Number(f.ticketPrice) * 100) / 100
  if (!(price > 0)) return { ok: false, error: "Set a ticket price." }
  const { sold, held } = await ticketCounts(db, id)
  const capacity = Math.floor(Number(f.capacity))
  if (!(capacity >= sold + held)) return { ok: false, error: `Capacity can't go below the ${sold + held} tickets already sold or in checkout.` }
  const maxPer = Math.floor(Number(f.maxPerOrder))
  if (!(maxPer >= 1 && maxPer <= 20)) return { ok: false, error: "Tickets per order must be 1 to 20." }
  if (!f.title.trim()) return { ok: false, error: "Give the party a name." }
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(f.salesCloseAt)
  const close = m ? easternWallToUtc(m[1], Number(m[2]) * 60 + Number(m[3])) : new Date(f.salesCloseAt)
  if (Number.isNaN(close.getTime())) return { ok: false, error: "Check the sales close time." }
  await db.from("ticketed_events").update({
    title: f.title.trim(), description: f.description.trim(), details: cleanDetails(f.details), ticket_price: price, capacity, max_per_order: maxPer,
    sales_close_at: close.toISOString(), activities: f.activities.filter((a) => a.label.trim()), published: f.published,
    updated_at: new Date().toISOString(),
  }).eq("id", id)
  await logEvent(db, "party-updated", `party=${id} price=${price} cap=${capacity} published=${f.published}`)
  return { ok: true }
}

// ---------------------------------------------------------------- buying

export async function startCheckout(db: SupabaseClient, slug: string, b: { quantity: number; name: string; email: string; phone: string; smsOk: boolean }): Promise<{ url: string } | { error: string }> {
  const name = b.name.trim().slice(0, 80), email = b.email.trim().toLowerCase().slice(0, 120)
  if (!name) return { error: "Enter your name." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email; your tickets and door code go there." }
  const digits = b.phone.replace(/\D/g, "")
  const phone = digits.length === 10 ? "+1" + digits : digits.length === 11 && digits.startsWith("1") ? "+" + digits : ""
  if (b.smsOk && !phone) return { error: "Enter a 10-digit phone number to get your door code by text." }
  const { data } = await db.from("ticketed_events").select("*").eq("slug", slug).maybeSingle()
  const p = data as Party | null
  if (!p || !p.published) return { error: "We couldn't find that party." }

  const { data: orderId, error } = await db.rpc("reserve_ticket_order", {
    p_event: p.id, p_qty: Math.floor(Number(b.quantity)), p_name: name, p_email: email, p_phone: phone || null, p_sms: Boolean(b.smsOk && phone),
  })
  if (error) {
    const m = String(error.message)
    if (m.includes("SOLD_OUT")) {
      const left = Number(m.split("SOLD_OUT:")[1]) || 0
      return { error: left > 0 ? `Only ${left} ticket${left === 1 ? "" : "s"} left. Lower the number and try again.` : "Sold out, sorry!" }
    }
    if (m.includes("SALES_CLOSED")) return { error: "Ticket sales for this party have closed." }
    if (m.includes("BAD_QTY")) return { error: `You can buy 1 to ${p.max_per_order} tickets per order.` }
    if (m.includes("EVENT_NOT_ON")) return { error: "This party isn't on sale." }
    await logFailure(db, "party-reserve-FAILED", `party=${p.id} err=${m.slice(0, 200)}`)
    return { error: "Something went wrong. Try again." }
  }

  const qty = Math.floor(Number(b.quantity))
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: qty, price_data: { currency: "usd", unit_amount: Math.round(Number(p.ticket_price) * 100), product_data: { name: `${p.title}: ticket`, description: whenLabel(p.starts_at, p.ends_at) } } }],
      customer_email: email,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      payment_intent_data: { description: `Tee365 party: ${p.title} x${qty}`, metadata: { type: "ticket", order_id: String(orderId), event_id: p.id } },
      success_url: `${partyUrl(p.slug)}?bought=1`,
      cancel_url: partyUrl(p.slug),
    })
    await db.from("ticket_orders").update({ stripe_session_id: session.id }).eq("id", orderId)
    return { url: session.url! }
  } catch (e) {
    await db.from("ticket_orders").update({ status: "expired" }).eq("id", orderId)
    await logFailure(db, "party-checkout-FAILED", `party=${p.id} err=${String(e).slice(0, 200)}`)
    return { error: "Couldn't open checkout. Try again." }
  }
}

function doorLine(p: Party): string {
  const open = new Date(new Date(p.starts_at).getTime() - DOOR_OPENS_EARLY_MINUTES * 60000)
  const t = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/Indiana/Indianapolis", hour: "numeric", minute: "2-digit" })
  return `Door code: ${p.door_pin}. It works from ${t(open)} to ${t(new Date(p.ends_at))}.`
}

/** Stripe webhook: tickets paid. Idempotent. */
export async function recordTicketPayment(db: SupabaseClient, pi: { id: string; amount_received: number; metadata: Record<string, string> }): Promise<void> {
  const orderId = pi.metadata.order_id
  const { data: upd } = await db.from("ticket_orders").update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent_id: pi.id })
    .eq("id", orderId).in("status", ["pending", "expired"]).select("*")
  const o = ((upd ?? []) as Order[])[0]
  if (!o) return // already recorded (Stripe retry) or unknown order
  const { data: pd } = await db.from("ticketed_events").select("*").eq("id", o.event_id).single()
  const p = pd as Party
  const { sold } = await ticketCounts(db, p.id)
  await notifyOwner(`Tickets: ${o.name} bought ${o.quantity} for "${p.title}" (${money(o.amount)}). ${sold} of ${p.capacity} sold.${sold > p.capacity ? ` OVER CAPACITY by ${sold - p.capacity}.` : ""}`)

  // If codes have already gone out, this buyer gets theirs now.
  const withCode = Boolean(p.codes_sent_at && p.door_pin && !p.door_revoked_at)
  try {
    await sendFounderMessage({
      to: o.email, firstName: o.name.split(" ")[0], kind: "party-tickets",
      subject: `Your tickets: ${p.title}`, heading: "You're in!",
      paragraphs: [
        `${o.quantity} ticket${o.quantity > 1 ? "s" : ""} for ${p.title}, ${whenLabel(p.starts_at, p.ends_at)}, at Tee365, 4615 Grape Rd, Mishawaka. Total paid: ${money(o.amount)}.`,
        `Your order admits ${o.quantity} ${o.quantity > 1 ? "people" : "person"}, of any age. The room has a hard capacity, so everyone who comes needs their own ticket.`,
        withCode ? doorLine(p) : `Your door code comes by email${o.sms_ok ? " and text" : ""} about 3 hours before the start.`,
        "Tee365 is alcohol-free. Questions? Call (574) 444-9365.",
      ],
      ctaText: "Party details", ctaUrl: partyUrl(p.slug),
    })
  } catch (e) {
    await logFailure(db, "party-ticket-email-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
  }
  if (o.sms_ok && o.phone && !withCode) {
    try {
      await sendEventText({ to: o.phone, kind: "party-tickets",
        body: `Tee365: you're in! ${o.quantity} ticket${o.quantity > 1 ? "s" : ""} for ${p.title}, ${whenLabel(p.starts_at, p.ends_at)}. Each ticket admits one person. We'll text your door code about 3 hours before.` })
    } catch (e) {
      await logFailure(db, "party-ticket-sms-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
    }
  }
  if (withCode) await sendCode(db, p, o)
}

async function sendCode(db: SupabaseClient, p: Party, o: Order): Promise<void> {
  const first = o.name.split(" ")[0]
  let ok = false
  try {
    await sendFounderMessage({
      to: o.email, firstName: first, kind: "party-door-code",
      subject: `Door code for ${p.title}`, heading: "Your door code",
      paragraphs: [`${p.title}, ${whenLabel(p.starts_at, p.ends_at)}.`, doorLine(p), "See you there! Tee365, 4615 Grape Rd, Mishawaka."],
    })
    ok = true
  } catch (e) {
    await logFailure(db, "party-code-email-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
  }
  if (o.sms_ok && o.phone) {
    try {
      await sendEventText({ to: o.phone, body: `Tee365: ${p.title} today. ${doorLine(p)} 4615 Grape Rd, Mishawaka.`, kind: "party-door-code" })
      ok = true
    } catch (e) {
      await logFailure(db, "party-code-sms-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
    }
  }
  if (ok) await db.from("ticket_orders").update({ code_sent_at: new Date().toISOString() }).eq("id", o.id)
}

// ---------------------------------------------------------------- refunds / cancel

export async function refundOrder(db: SupabaseClient, orderId: string, reason: "refund" | "cancelled" = "refund"): Promise<{ ok: boolean; error?: string }> {
  const { data } = await db.from("ticket_orders").select("*, ticketed_events(title, starts_at, ends_at)").eq("id", orderId).single()
  const o = data as Order & { ticketed_events: { title: string; starts_at: string; ends_at: string } | null }
  if (!o || o.status !== "paid" || !o.stripe_payment_intent_id) return { ok: false, error: "Only a paid order can be refunded." }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
    await stripe.refunds.create({ payment_intent: o.stripe_payment_intent_id }, { idempotencyKey: `ticket-refund-${o.id}` })
  } catch (e) {
    await logFailure(db, "party-refund-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
    return { ok: false, error: "Stripe refused the refund. Do it in Stripe by hand." }
  }
  await db.from("ticket_orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", o.id)
  const title = o.ticketed_events?.title ?? "the party"
  const when = o.ticketed_events ? whenLabel(o.ticketed_events.starts_at, o.ticketed_events.ends_at) : ""
  const tix = `${o.quantity} ticket${o.quantity > 1 ? "s" : ""}`
  try {
    await sendFounderMessage({
      to: o.email, firstName: o.name.split(" ")[0], kind: reason === "cancelled" ? "party-cancelled" : "party-refund",
      subject: reason === "cancelled" ? `Cancelled: ${title}` : `Refund: ${title}`,
      heading: reason === "cancelled" ? "This party has been cancelled" : "Your tickets were refunded",
      paragraphs: [
        reason === "cancelled"
          ? `We're sorry: ${title}${when ? ` (${when})` : ""} has been cancelled. We've refunded the full ${money(o.amount)} for your ${tix}.`
          : `We refunded ${money(o.amount)} for your ${tix} to ${title}.`,
        "It usually shows on your card in 5 to 10 days. Questions? Call (574) 444-9365.",
      ],
    })
  } catch { /* logged by the mailer */ }
  if (o.sms_ok && o.phone) {
    try {
      await sendEventText({ to: o.phone, kind: reason === "cancelled" ? "party-cancelled" : "party-refund",
        body: reason === "cancelled"
          ? `Tee365: sorry, ${title}${when ? ` (${when})` : ""} has been cancelled. Your ${money(o.amount)} has been refunded to your card (5 to 10 days). Questions: (574) 444-9365`
          : `Tee365: we refunded ${money(o.amount)} for your ${tix} to ${title}. It shows on your card in 5 to 10 days.` })
    } catch (e) {
      await logFailure(db, "party-refund-sms-FAILED", `order=${o.id} err=${String(e).slice(0, 200)}`)
    }
  }
  await logEvent(db, "party-order-refunded", `order=${o.id} amount=${o.amount}`)
  return { ok: true }
}

export async function cancelParty(db: SupabaseClient, id: string): Promise<{ refunded: number; failed: number }> {
  const { data } = await db.from("ticketed_events").select("*").eq("id", id).single()
  const p = data as Party
  await db.from("ticketed_events").update({ status: "cancelled", published: false, updated_at: new Date().toISOString() }).eq("id", id)
  if (p.blocked_time_ids.length) await db.from("blocked_times").delete().in("id", p.blocked_time_ids)
  const { data: paid } = await db.from("ticket_orders").select("id").eq("event_id", id).eq("status", "paid")
  let refunded = 0, failed = 0
  for (const o of (paid ?? []) as { id: string }[]) {
    const r = await refundOrder(db, o.id, "cancelled")
    if (r.ok) refunded++
    else failed++
  }
  // Door and bays are cleaned up by the next runParties (cancelled parties revoke and switch off).
  await runParties(db, new Date())
  await logEvent(db, "party-cancelled", `party=${id} refunded=${refunded} failed=${failed}`)
  return { refunded, failed }
}

// ---------------------------------------------------------------- door + bays (cron)

export type PartyStep = "grant-door" | "send-codes" | "revoke-door" | "bays-on" | "bays-off"

/** Which steps are due for a party right now. Pure, for testing. */
export function dueSteps(p: Pick<Party, "status" | "published" | "starts_at" | "ends_at" | "door_user_id" | "door_pin" | "door_revoked_at" | "bays_on_at" | "bays_off_at">, now: Date): PartyStep[] {
  const t = now.getTime(), start = new Date(p.starts_at).getTime(), end = new Date(p.ends_at).getTime()
  // "published" here means on sale OR already sold tickets (runParties passes that),
  // so a hidden draft does nothing but pulling a sold-out party off sale still runs.
  const live = p.status === "on" && p.published
  const granted = Boolean(p.door_user_id || p.door_pin), revoked = Boolean(p.door_revoked_at)
  const out: PartyStep[] = []
  if (granted && !revoked && (!live || t >= end + 15 * 60000)) out.push("revoke-door")
  else if (live && !granted && t >= start - DOOR_GRANT_BEFORE_MIN * 60000 && t < end) out.push("grant-door")
  if (live && granted && !revoked && t >= start - CODES_BEFORE_MIN * 60000 && t < end) out.push("send-codes")
  if (p.bays_on_at && !p.bays_off_at && (!live || t >= end)) out.push("bays-off")
  else if (live && !p.bays_on_at && t >= start - BAYS_ON_BEFORE_MIN * 60000 && t < end) out.push("bays-on")
  return out
}

export async function runParties(db: SupabaseClient, now: Date): Promise<string[]> {
  const from = new Date(now.getTime() - 3 * 86400000).toISOString()
  const to = new Date(now.getTime() + 2 * 86400000).toISOString()
  const { data } = await db.from("ticketed_events").select("*").lt("starts_at", to).gt("ends_at", from)
  const done: string[] = []
  for (const p of (data ?? []) as Party[]) {
    const { sold } = await ticketCounts(db, p.id)
    for (const step of dueSteps({ ...p, published: p.published || sold > 0 }, now)) {
      try {
        if (step === "grant-door") {
          try {
            const g = await grantBayAccess({ bookingId: `party-${p.id}`, firstName: "Party", lastName: p.title.slice(0, 40), phone: "", bayName: "Party", startsAt: new Date(p.starts_at), endsAt: new Date(p.ends_at), graceAfterEndMinutes: 0 })
            await db.from("ticketed_events").update({ door_pin: g.pinCode, door_user_id: g.userId, door_policy_id: g.accessPolicyId, door_schedule_id: g.scheduleId, door_granted_at: new Date().toISOString(), door_error: null }).eq("id", p.id)
            await notifyOwner(`Party door code for "${p.title}": ${g.pinCode}. Buyers get it 3 hours before the start.`)
          } catch (e) {
            if (!p.door_error) await notifyOwner(`Party door code for "${p.title}" could NOT be created (UniFi error). Retrying every 15 minutes.`)
            await db.from("ticketed_events").update({ door_error: String(e).slice(0, 300) }).eq("id", p.id)
            throw e
          }
        }
        if (step === "send-codes") {
          const { data: fresh } = await db.from("ticketed_events").select("*").eq("id", p.id).single()
          const { data: orders } = await db.from("ticket_orders").select("*").eq("event_id", p.id).eq("status", "paid").is("code_sent_at", null)
          for (const o of (orders ?? []) as Order[]) await sendCode(db, fresh as Party, o)
          if (!p.codes_sent_at) await db.from("ticketed_events").update({ codes_sent_at: new Date().toISOString() }).eq("id", p.id)
          if ((orders ?? []).length) done.push(`codes ${p.id} x${(orders ?? []).length}`)
          continue
        }
        if (step === "revoke-door") {
          try {
            if (p.door_user_id) await revokeBayAccess(p.door_user_id, p.door_policy_id, p.door_schedule_id)
            await db.from("ticketed_events").update({ door_revoked_at: new Date().toISOString(), door_error: null }).eq("id", p.id)
          } catch (e) {
            if (!p.door_error) await notifyOwner(`Party door code for "${p.title}" could NOT be deleted; it would keep working every week at that time. Retrying every 15 minutes; delete user "Party ${p.title.slice(0, 40)}" in UniFi if it repeats.`)
            await db.from("ticketed_events").update({ door_error: String(e).slice(0, 300) }).eq("id", p.id)
            throw e
          }
        }
        if (step === "bays-on") {
          const { data: statuses } = await db.from("bay_agent_status").select("bay_id, override_state").in("bay_id", p.bay_ids.length ? p.bay_ids : ["00000000-0000-0000-0000-000000000000"])
          const on: string[] = []
          for (const s of (statuses ?? []) as { bay_id: string; override_state: string | null }[]) {
            if (s.override_state) continue // never override maintenance
            const { data: ok } = await db.from("bay_agent_status").update({ override_state: "occupied" }).eq("bay_id", s.bay_id).is("override_state", null).select("bay_id")
            if ((ok ?? []).length) on.push(s.bay_id)
          }
          await db.from("ticketed_events").update({ bays_turned_on: on, bays_on_at: new Date().toISOString() }).eq("id", p.id)
          await notifyOwner(`Party "${p.title}": ${on.length} of ${p.bay_ids.length} bays starting up now.`)
        }
        if (step === "bays-off") {
          if (p.bays_turned_on.length) await db.from("bay_agent_status").update({ override_state: null }).in("bay_id", p.bays_turned_on).eq("override_state", "occupied")
          await db.from("ticketed_events").update({ bays_off_at: new Date().toISOString() }).eq("id", p.id)
        }
        done.push(`${step} ${p.id}`)
      } catch (e) {
        await logFailure(db, `party-${step}-FAILED`, `party=${p.id} err=${String(e).slice(0, 300)}`)
      }
    }
  }
  // Tidy: checkouts that were never finished.
  await db.from("ticket_orders").update({ status: "expired" }).eq("status", "pending").lt("created_at", new Date(now.getTime() - HOLD_MINUTES * 60000).toISOString())
  return done
}
