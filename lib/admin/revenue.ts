/**
 * Revenue bucketing helpers for the admin dashboard and /admin/sales.
 *
 * Every dollar is first collected as a dated RevenueEvent (one DB query per
 * source), then summed into whatever windows a page needs: the period cards,
 * their comparison windows, and the month-by-month table. One collector means
 * the cards, the monthly history and the drill-downs cannot disagree about
 * what counts as revenue.
 */

import { addDaysToDateKey, easternDateKey, easternMidnightUtc } from "@/lib/time/eastern"

export type PeriodKey = "today" | "week" | "mtd" | "lastMonth" | "ytd"

export type RevenueBuckets = Record<PeriodKey, number>

export type RevenueSource =
  | "bookings" | "extensions" | "giftCards" | "memberships" | "renewals"
  | "events" | "parties" | "league"

export type RevenueBreakdown = Record<RevenueSource | "total", RevenueBuckets> & {
  /** Total for each period's comparison window (see COMPARISON_LABELS), null where there is none. */
  previous: Record<PeriodKey, number | null>
}

export type DateRange = { start: Date; end: Date }

export type RevenueEvent = { source: RevenueSource; amount: number; when: Date }

/** First-of-month key ("YYYY-MM-01") shifted by whole months. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
}

// Built from Eastern calendar dates rather than a fixed offset, so a window
// that spans a DST change (Nov 1, Mar 8) still starts at local midnight.
export function computePeriodBoundaries(now: Date = new Date()): {
  todayStart: Date; weekStart: Date; monthStart: Date; lastMonthStart: Date; yearStart: Date
} {
  const todayKey = easternDateKey(now)
  const monthKey = `${todayKey.slice(0, 8)}01`
  return {
    todayStart: easternMidnightUtc(todayKey),
    weekStart: easternMidnightUtc(addDaysToDateKey(todayKey, -6)),
    monthStart: easternMidnightUtc(monthKey),
    lastMonthStart: easternMidnightUtc(shiftMonthKey(monthKey, -1)),
    yearStart: easternMidnightUtc(`${todayKey.slice(0, 4)}-01-01`),
  }
}

export function periodRanges(now: Date = new Date()): Record<PeriodKey, DateRange> {
  const b = computePeriodBoundaries(now)
  return {
    today: { start: b.todayStart, end: now },
    week: { start: b.weekStart, end: now },
    mtd: { start: b.monthStart, end: now },
    lastMonth: { start: b.lastMonthStart, end: b.monthStart },
    ytd: { start: b.yearStart, end: now },
  }
}

export const COMPARISON_LABELS: Record<PeriodKey, string | null> = {
  today: "vs same time last week",
  week: "vs the 7 days before",
  mtd: "vs same point last month",
  lastMonth: "vs the month before",
  ytd: null,
}

// Like-for-like windows: a to-date period is compared with the same amount of
// elapsed time in the earlier period, so the 2nd of the month is not measured
// against all of last month.
export function comparisonRanges(now: Date = new Date()): Record<PeriodKey, DateRange | null> {
  const b = computePeriodBoundaries(now)
  const todayKey = easternDateKey(now)
  const lastWeekDay = easternMidnightUtc(addDaysToDateKey(todayKey, -7))
  const monthElapsed = now.getTime() - b.monthStart.getTime()
  const lastMonthPoint = new Date(Math.min(b.lastMonthStart.getTime() + monthElapsed, b.monthStart.getTime()))
  return {
    today: { start: lastWeekDay, end: new Date(lastWeekDay.getTime() + (now.getTime() - b.todayStart.getTime())) },
    week: { start: easternMidnightUtc(addDaysToDateKey(todayKey, -13)), end: b.weekStart },
    mtd: { start: b.lastMonthStart, end: lastMonthPoint },
    lastMonth: { start: easternMidnightUtc(shiftMonthKey(`${todayKey.slice(0, 8)}01`, -2)), end: b.lastMonthStart },
    ytd: null,
  }
}

export function sumInRange(events: RevenueEvent[], range: DateRange, source?: RevenueSource): number {
  let total = 0
  for (const e of events) {
    if (source && e.source !== source) continue
    if (e.when >= range.start && e.when < range.end) total += e.amount
  }
  return Math.round(total * 100) / 100
}

// What a signup actually earned. Prefer memberships.signup_amount_paid, which
// the Stripe webhook fills in with what the PaymentIntent really collected, so
// a discounted or partially-paid signup is counted at its real value instead of
// the plan's list price. Rows from before that column existed (2026-09-11) have
// it null, and those fall back to sticker so historical YTD totals don't shift
// under us. Returns null when neither is available, which the caller skips
// rather than booking a guessed number.
export function membershipSignupRevenue(m: {
  signup_amount_paid: number | null
  membership_plans: { price_monthly: number; joining_fee: number | null } | null
}): number | null {
  if (m.signup_amount_paid !== null && m.signup_amount_paid !== undefined) {
    return Number(m.signup_amount_paid)
  }
  const plan = m.membership_plans
  if (!plan) return null
  return Number(plan.price_monthly) + Number(plan.joining_fee ?? 0)
}

// PostgREST caps a response at 1000 rows. Page through so a year of bookings
// is not silently truncated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(makeQuery: () => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

/** Every revenue dollar since `since`, tagged with its source and when it came in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function collectRevenueEvents(serviceClient: any, since: Date): Promise<RevenueEvent[]> {
  const sinceIso = since.toISOString()

  const [bookings, extensions, giftCards, memberships, renewalLogs, eventPayments, ticketOrders, leagueCharges] = await Promise.all([
    fetchAllRows<{ total: number; gift_card_applied: number | null; refund_amount: number | null; paid_at: string }>(() =>
      serviceClient
        .from("bookings")
        .select("total, gift_card_applied, refund_amount, paid_at")
        .gte("paid_at", sinceIso)
        .not("paid_at", "is", null)
        .order("paid_at")),
    // Extensions are their own source, bucketed by when the extension was
    // bought rather than when the original booking was paid for - an
    // extension sold tonight on yesterday's booking belongs to tonight.
    fetchAllRows<{ extension_revenue: number | null; last_extended_at: string }>(() =>
      serviceClient
        .from("bookings")
        .select("extension_revenue, last_extended_at")
        .gt("extension_revenue", 0)
        .gte("last_extended_at", sinceIso)
        .not("last_extended_at", "is", null)
        .order("last_extended_at")),
    fetchAllRows<{ original_amount: number; created_at: string; stripe_payment_id: string | null }>(() =>
      serviceClient
        .from("gift_cards")
        .select("original_amount, created_at, stripe_payment_id")
        .gte("created_at", sinceIso)
        .order("created_at")),
    fetchAllRows<{
      started_at: string; granted_free: boolean | null; signup_amount_paid: number | null
      membership_plans: { price_monthly: number; joining_fee: number | null } | null
    }>(() =>
      serviceClient
        .from("memberships")
        .select("started_at, granted_free, signup_amount_paid, membership_plans(price_monthly, joining_fee)")
        .gte("started_at", sinceIso)
        .order("started_at")),
    fetchAllRows<{ detail: string; created_at: string }>(() =>
      serviceClient
        .from("admin_logs")
        .select("detail, created_at")
        .eq("event", "invoice-paid-subscription_cycle")
        .gte("created_at", sinceIso)
        .order("created_at")),
    // Private events, parties and league nights are paid outside bookings, so
    // until 2026-11-02 none of it reached this page. Refunded rows change
    // status away from paid/succeeded and drop out on their own.
    fetchAllRows<{ amount: number; paid_at: string }>(() =>
      serviceClient
        .from("event_payments")
        .select("amount, paid_at")
        .eq("status", "paid")
        .gte("paid_at", sinceIso)
        .order("paid_at")),
    fetchAllRows<{ amount: number; paid_at: string }>(() =>
      serviceClient
        .from("ticket_orders")
        .select("amount, paid_at")
        .eq("status", "paid")
        .gte("paid_at", sinceIso)
        .order("paid_at")),
    // league_charges has no paid_at; updated_at is stamped when the charge
    // flips to succeeded.
    fetchAllRows<{ amount: number; updated_at: string }>(() =>
      serviceClient
        .from("league_charges")
        .select("amount, updated_at")
        .eq("status", "succeeded")
        .gte("updated_at", sinceIso)
        .order("updated_at")),
  ])

  const events: RevenueEvent[] = []
  const push = (source: RevenueSource, amount: number, when: string) => {
    if (amount > 0) events.push({ source, amount, when: new Date(when) })
  }

  for (const b of bookings) {
    push("bookings", Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0), b.paid_at)
  }

  // Extensions are charged on their own PaymentIntent and never touched
  // `total`, so every dollar customers paid to add time was missing from
  // revenue entirely until 2026-09-12. Reported separately rather than folded
  // into bookings: a booking still shows what it was sold for, and added time
  // is visible as its own line of business. Extensions from before the column
  // existed carry 0 and no timestamp, so they simply do not appear - that
  // money was never recorded anywhere to recover.
  for (const e of extensions) push("extensions", Number(e.extension_revenue ?? 0), e.last_extended_at)

  for (const g of giftCards) {
    // Admin-issued cards (/admin/gift-cards) carry no Stripe payment - they're
    // comps, so their face value is a liability we owe, not money we took in.
    if (!g.stripe_payment_id) continue
    push("giftCards", Number(g.original_amount), g.created_at)
  }

  for (const m of memberships) {
    // Free grants (admin direct grant / giveaway code) collect nothing at
    // signup - see memberships.granted_free. Counting their sticker price is
    // what put $88 of "September signups" on /admin/sales when $78 of it was
    // two year-long free grants. Their eventual paid renewals still land in
    // the renewals bucket below once Stripe actually charges them.
    if (m.granted_free) continue
    const signupRevenue = membershipSignupRevenue(m)
    if (signupRevenue !== null) push("memberships", signupRevenue, m.started_at)
  }

  // Parse renewal amounts from admin_logs detail string: "birdie – John Smith sub=sub_xxx amount=$29.00"
  for (const r of renewalLogs) {
    const match = r.detail.match(/amount=\$([0-9.]+)/)
    if (match) push("renewals", parseFloat(match[1]), r.created_at)
  }

  for (const p of eventPayments) push("events", Number(p.amount), p.paid_at)
  for (const t of ticketOrders) push("parties", Number(t.amount), t.paid_at)
  for (const c of leagueCharges) push("league", Number(c.amount), c.updated_at)

  return events
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeRevenue(serviceClient: any, now: Date = new Date()): Promise<RevenueBreakdown> {
  const ranges = periodRanges(now)
  const compare = comparisonRanges(now)
  const since = new Date(Math.min(
    ranges.ytd.start.getTime(),
    ...Object.values(compare).filter((r): r is DateRange => r !== null).map((r) => r.start.getTime()),
  ))
  const events = await collectRevenueEvents(serviceClient, since)

  const bucketsFor = (source?: RevenueSource): RevenueBuckets => ({
    today: sumInRange(events, ranges.today, source),
    week: sumInRange(events, ranges.week, source),
    mtd: sumInRange(events, ranges.mtd, source),
    lastMonth: sumInRange(events, ranges.lastMonth, source),
    ytd: sumInRange(events, ranges.ytd, source),
  })

  const previous = {} as Record<PeriodKey, number | null>
  for (const key of Object.keys(compare) as PeriodKey[]) {
    const r = compare[key]
    previous[key] = r ? sumInRange(events, r) : null
  }

  return {
    bookings: bucketsFor("bookings"),
    extensions: bucketsFor("extensions"),
    giftCards: bucketsFor("giftCards"),
    memberships: bucketsFor("memberships"),
    renewals: bucketsFor("renewals"),
    events: bucketsFor("events"),
    parties: bucketsFor("parties"),
    league: bucketsFor("league"),
    total: bucketsFor(),
    previous,
  }
}

/* ------------------------------------------------------------------ *
 * Drill-down: the individual rows behind each number on /admin/sales. *
 * ------------------------------------------------------------------ */

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  bookings: "Bay bookings",
  extensions: "Bay extensions",
  giftCards: "Gift cards sold",
  memberships: "Membership sign-ups",
  renewals: "Membership renewals",
  events: "Private events",
  parties: "Party tickets",
  league: "League",
}

// The order these are shown in, everywhere. Jerrod's ordering, 2026-09-12:
// the two bay-time lines first since that is the core business, then the
// recurring membership money, then gift cards. Kept here rather than
// repeated per page so the dashboard, the sales page and any future view
// cannot drift out of agreement about it.
export const REVENUE_SOURCE_ORDER: RevenueSource[] = [
  "bookings",
  "extensions",
  "renewals",
  "memberships",
  "giftCards",
  "events",
  "parties",
  "league",
]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  week: "Last 7 days",
  mtd: "Month to date",
  lastMonth: "Last month",
  ytd: "Year to date",
}

export type RevenueLineItem = {
  when: string
  who: string
  detail: string
  amount: number
  /** Set when excluded from revenue, explaining why it collected nothing. */
  excludedReason?: string
  href?: string
}

export function startForPeriod(period: PeriodKey): Date {
  return periodRanges()[period].start
}

type PersonRef = { first_name: string | null; last_name: string | null } | null

type BookingDetailRow = {
  total: number; gift_card_applied: number | null; refund_amount: number | null
  paid_at: string; status: string
  bays: { name: string } | null
  profiles: PersonRef
}

type ExtensionDetailRow = {
  id: string; extension_revenue: number; extension_minutes: number | null
  extension_count: number | null; last_extended_at: string
  duration_minutes: number | null
  bays: { name: string } | null; profiles: PersonRef
}

type GiftCardDetailRow = {
  code: string; original_amount: number; created_at: string
  purchased_by: string | null; recipient_name: string | null; stripe_payment_id: string | null
}

type MembershipDetailRow = {
  user_id: string; started_at: string; plan_type: string; granted_free: boolean | null
  signup_amount_paid: number | null
  membership_plans: { name: string; price_monthly: number; joining_fee: number | null } | null
  profiles: PersonRef
}

// Deliberately returns excluded-but-relevant rows too (free grants, comped
// gift cards, fully-refunded bookings) marked with excludedReason rather than
// hiding them. The whole reason this drill-down exists is that a number looked
// wrong and there was no way to see what fed it - showing only the rows that
// counted would reproduce exactly that blind spot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRevenueLineItems(serviceClient: any, source: RevenueSource, period: PeriodKey): Promise<RevenueLineItem[]> {
  const range = periodRanges()[period]
  const since = range.start.toISOString()
  const until = range.end.toISOString()
  const name = (p: PersonRef) =>
    p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown" : "Unknown"

  if (source === "bookings") {
    const { data } = await serviceClient
      .from("bookings")
      .select("id, total, gift_card_applied, refund_amount, paid_at, status, bays(name), profiles!user_id(first_name, last_name)")
      .gte("paid_at", since)
      .lt("paid_at", until)
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
    return ((data ?? []) as BookingDetailRow[]).map(b => {
      const cash = Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0)
      const parts = [b.bays?.name ?? "Bay ?", b.status]
      if (Number(b.gift_card_applied ?? 0) > 0) parts.push(`gift card -$${Number(b.gift_card_applied).toFixed(2)}`)
      if (Number(b.refund_amount ?? 0) > 0) parts.push(`refunded -$${Number(b.refund_amount).toFixed(2)}`)
      return {
        when: b.paid_at,
        who: name(b.profiles),
        detail: parts.join(" · "),
        amount: cash,
        excludedReason: cash > 0 ? undefined : "nothing collected after gift card / refund",
        href: "/admin/bookings",
      }
    })
  }

  if (source === "extensions") {
    const { data } = await serviceClient
      .from("bookings")
      .select("id, extension_revenue, extension_minutes, extension_count, last_extended_at, duration_minutes, bays(name), profiles!user_id(first_name, last_name)")
      .gt("extension_revenue", 0)
      .gte("last_extended_at", since)
      .lt("last_extended_at", until)
      .not("last_extended_at", "is", null)
      .order("last_extended_at", { ascending: false })
    return ((data ?? []) as ExtensionDetailRow[]).map(e => {
      const times = Number(e.extension_count ?? 0)
      const parts = [e.bays?.name ?? "Bay ?"]
      if (Number(e.extension_minutes ?? 0) > 0) {
        parts.push(`+${e.extension_minutes} min added`)
      }
      if (e.duration_minutes) {
        parts.push(`booked ${e.duration_minutes} min`)
      }
      if (times > 1) parts.push(`${times} separate extensions`)
      return {
        when: e.last_extended_at,
        who: name(e.profiles),
        detail: parts.join(" · "),
        amount: Number(e.extension_revenue),
        href: "/admin/bookings",
      }
    })
  }

  if (source === "giftCards") {
    const { data } = await serviceClient
      .from("gift_cards")
      .select("code, original_amount, created_at, purchased_by, recipient_name, stripe_payment_id")
      .gte("created_at", since)
      .lt("created_at", until)
      .order("created_at", { ascending: false })
    return ((data ?? []) as GiftCardDetailRow[]).map(g => ({
      when: g.created_at,
      who: g.purchased_by || "Unknown",
      detail: `${g.code} → ${g.recipient_name || "unnamed recipient"}`,
      amount: Number(g.original_amount),
      excludedReason: g.stripe_payment_id ? undefined : "admin-issued, no payment taken",
      href: "/admin/gift-cards",
    }))
  }

  if (source === "memberships") {
    const { data } = await serviceClient
      .from("memberships")
      .select("id, user_id, started_at, plan_type, granted_free, signup_amount_paid, membership_plans(name, price_monthly, joining_fee), profiles!user_id(first_name, last_name)")
      .gte("started_at", since)
      .lt("started_at", until)
      .order("started_at", { ascending: false })
    return ((data ?? []) as MembershipDetailRow[]).map(m => {
      const plan = m.membership_plans
      const sticker = Number(plan?.price_monthly ?? 0) + Number(plan?.joining_fee ?? 0)
      const collected = membershipSignupRevenue(m) ?? 0
      const bits = [plan?.name ?? m.plan_type]
      if (plan && Number(plan.joining_fee ?? 0) > 0) {
        bits.push(`$${Number(plan.price_monthly).toFixed(2)}/mo + $${Number(plan.joining_fee).toFixed(2)} joining fee`)
      }
      // Worth calling out when the charge came in under list price, since the
      // row otherwise looks like the plan was simply priced differently.
      if (!m.granted_free && m.signup_amount_paid !== null && collected < sticker) {
        bits.push(`charged $${collected.toFixed(2)} of $${sticker.toFixed(2)}`)
      }
      return {
        when: m.started_at,
        who: name(m.profiles),
        detail: bits.join(" · "),
        amount: m.granted_free ? 0 : collected,
        excludedReason: m.granted_free ? `free grant, sticker price $${sticker.toFixed(2)} not collected` : undefined,
        href: `/admin/users/${m.user_id}`,
      }
    })
  }

  if (source === "events") {
    const { data } = await serviceClient
      .from("event_payments")
      .select("event_id, kind, amount, status, paid_at")
      .gte("paid_at", since)
      .lt("paid_at", until)
      .order("paid_at", { ascending: false })
    const rows = (data ?? []) as Array<{ event_id: string; kind: string | null; amount: number; status: string; paid_at: string }>
    const ids = [...new Set(rows.map((r) => r.event_id))]
    const { data: evs } = ids.length
      ? await serviceClient.from("events").select("id, title, contact_name").in("id", ids)
      : { data: [] }
    const byId = new Map(((evs ?? []) as Array<{ id: string; title: string; contact_name: string | null }>).map((e) => [e.id, e]))
    return rows.map((p) => {
      const ev = byId.get(p.event_id)
      return {
        when: p.paid_at,
        who: ev?.contact_name || "Unknown",
        detail: [ev?.title ?? "Event", p.kind].filter(Boolean).join(" · "),
        amount: Number(p.amount),
        excludedReason: p.status === "paid" ? undefined : p.status,
        href: `/admin/events/${p.event_id}`,
      }
    })
  }

  if (source === "parties") {
    const { data } = await serviceClient
      .from("ticket_orders")
      .select("event_id, name, quantity, amount, status, paid_at")
      .gte("paid_at", since)
      .lt("paid_at", until)
      .order("paid_at", { ascending: false })
    return ((data ?? []) as Array<{ event_id: string; name: string | null; quantity: number; amount: number; status: string; paid_at: string }>).map((t) => ({
      when: t.paid_at,
      who: t.name || "Unknown",
      detail: `${t.quantity} ticket${t.quantity === 1 ? "" : "s"}`,
      amount: Number(t.amount),
      excludedReason: t.status === "paid" ? undefined : t.status,
      href: `/admin/tickets/${t.event_id}`,
    }))
  }

  if (source === "league") {
    const { data } = await serviceClient
      .from("league_charges")
      .select("payer_user_id, player_user_ids, amount, status, updated_at")
      .eq("status", "succeeded")
      .gte("updated_at", since)
      .lt("updated_at", until)
      .order("updated_at", { ascending: false })
    const rows = (data ?? []) as Array<{ payer_user_id: string; player_user_ids: string[] | null; amount: number; updated_at: string }>
    const ids = [...new Set(rows.map((r) => r.payer_user_id))]
    const { data: people } = ids.length
      ? await serviceClient.from("profiles").select("id, first_name, last_name").in("id", ids)
      : { data: [] }
    const byId = new Map(((people ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((p) => [p.id, p]))
    return rows.map((c) => {
      const players = c.player_user_ids?.length ?? 1
      return {
        when: c.updated_at,
        who: name(byId.get(c.payer_user_id) ?? null),
        detail: `League week · ${players} player${players === 1 ? "" : "s"}`,
        amount: Number(c.amount),
        href: `/admin/users/${c.payer_user_id}`,
      }
    })
  }

  const { data } = await serviceClient
    .from("admin_logs")
    .select("detail, created_at")
    .eq("event", "invoice-paid-subscription_cycle")
    .gte("created_at", since)
    .lt("created_at", until)
    .order("created_at", { ascending: false })
  return ((data ?? []) as Array<{ detail: string; created_at: string }>).map(r => {
    // Shape: "birdie – John Smith sub=sub_xxx amount=$29.00"
    const amount = parseFloat(r.detail.match(/amount=\$([0-9.]+)/)?.[1] ?? "0")
    const planAndName = r.detail.split(" sub=")[0] ?? r.detail
    const [plan, ...rest] = planAndName.split(" – ")
    return {
      when: r.created_at,
      who: rest.join(" – ").trim() || "Unknown",
      detail: `${plan} renewal`,
      amount,
    }
  })
}

// ---------------------------------------------------------------------------
// MRR
//
// This used to be a one-liner on the sales page that summed price_monthly for
// every active membership. That counted money nobody is paying: comped members
// who have no Stripe subscription at all, and free-grant members whose first
// charge is a year out. MRR is meant to answer "what bills next month", so a
// membership only counts when it is actually going to be charged.
//
// Every exclusion carries a reason so the sales table can show why a row is
// zero, rather than silently dropping it and leaving the total unexplainable.
// ---------------------------------------------------------------------------

export type MrrMembership = {
  status: string
  comped: boolean | null
  granted_free: boolean | null
  membership_paused: boolean | null
  is_annual: boolean | null
  current_period_end: string | null
  stripe_subscription_id: string | null
  membership_plans: { price_monthly: number } | null
}

export type MrrContribution = {
  /** What this membership adds to MRR. Zero whenever excludedReason is set. */
  amount: number
  /** Null when it counts. Otherwise a short label for the sales table. */
  excludedReason: string | null
}

// A monthly subscription's current period never runs more than about 31 days
// ahead. Anything further out is not billing this month: a granted free year,
// or an annual plan already paid up.
const MONTHLY_PERIOD_MAX_DAYS = 45

export function mrrContribution(m: MrrMembership, now: Date = new Date()): MrrContribution {
  const price = Number(m.membership_plans?.price_monthly ?? 0)

  if (m.status !== "active") {
    return { amount: 0, excludedReason: m.status.replace("_", " ") }
  }
  if (m.comped) {
    return { amount: 0, excludedReason: "Comped" }
  }
  if (m.membership_paused) {
    return { amount: 0, excludedReason: "Paused" }
  }
  if (!m.stripe_subscription_id) {
    return { amount: 0, excludedReason: "No subscription" }
  }
  if (!m.current_period_end) {
    return { amount: 0, excludedReason: "No renewal date" }
  }

  const daysOut = (new Date(m.current_period_end).getTime() - now.getTime()) / 86_400_000
  if (daysOut > MONTHLY_PERIOD_MAX_DAYS) {
    return {
      amount: 0,
      excludedReason: m.granted_free ? "Free until renewal" : "Prepaid until renewal",
    }
  }
  if (m.granted_free) {
    return { amount: 0, excludedReason: "Free grant" }
  }

  return { amount: price, excludedReason: null }
}

export type MrrSummary = {
  /** Money that will actually be billed over the next cycle. */
  mrr: number
  /** List-price value of everything excluded, so the gap is visible. */
  deferred: number
  billingCount: number
  excludedCount: number
}

export function computeMrr(memberships: MrrMembership[], now: Date = new Date()): MrrSummary {
  let mrr = 0
  let deferred = 0
  let billingCount = 0
  let excludedCount = 0

  for (const m of memberships) {
    const { amount, excludedReason } = mrrContribution(m, now)
    if (excludedReason === null) {
      mrr += amount
      billingCount += 1
    } else {
      deferred += Number(m.membership_plans?.price_monthly ?? 0)
      excludedCount += 1
    }
  }

  return { mrr, deferred, billingCount, excludedCount }
}
