/**
 * Revenue bucketing helpers for the admin dashboard.
 *
 * One DB query per source (bookings / extensions / gift cards / memberships /
 * renewals) since Jan 1.
 * Rows are bucketed into Today / 7d / MTD / YTD in JS — cheap on small row counts.
 */

export type RevenueBuckets = {
  today: number
  week: number   // rolling last 7 days including today
  mtd: number
  ytd: number
}

export type RevenueBreakdown = {
  bookings: RevenueBuckets
  extensions: RevenueBuckets
  giftCards: RevenueBuckets
  memberships: RevenueBuckets
  renewals: RevenueBuckets
  total: RevenueBuckets
}

function emptyBuckets(): RevenueBuckets {
  return { today: 0, week: 0, mtd: 0, ytd: 0 }
}

function addToBuckets(buckets: RevenueBuckets, amount: number, when: Date, boundaries: {
  todayStart: Date; weekStart: Date; monthStart: Date
}) {
  buckets.ytd += amount
  if (when >= boundaries.monthStart) buckets.mtd += amount
  if (when >= boundaries.weekStart) buckets.week += amount
  if (when >= boundaries.todayStart) buckets.today += amount
}

export function computePeriodBoundaries(): {
  todayStart: Date; weekStart: Date; monthStart: Date; yearStart: Date
} {
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" }))
  const todayET = new Date(nowET); todayET.setHours(0, 0, 0, 0)
  const weekET = new Date(todayET); weekET.setDate(weekET.getDate() - 6)
  const monthET = new Date(todayET.getFullYear(), todayET.getMonth(), 1)
  const yearET = new Date(todayET.getFullYear(), 0, 1)
  const offset = new Date().getTime() - nowET.getTime()
  return {
    todayStart: new Date(todayET.getTime() + offset),
    weekStart: new Date(weekET.getTime() + offset),
    monthStart: new Date(monthET.getTime() + offset),
    yearStart: new Date(yearET.getTime() + offset),
  }
}

// What a signup actually earned. Prefer memberships.signup_amount_paid, which
// the Stripe webhook fills in with what the PaymentIntent really collected, so
// a discounted or partially-paid signup is counted at its real value instead of
// the plan's list price. Rows from before that column existed (2026-09-11) have
// it null, and those fall back to sticker so historical YTD totals don't shift
// under us. Returns null when neither is available, which the caller skips
// rather than booking a guessed number.
function membershipSignupRevenue(m: {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeRevenue(serviceClient: any): Promise<RevenueBreakdown> {
  const { todayStart, weekStart, monthStart, yearStart } = computePeriodBoundaries()
  const boundaries = { todayStart, weekStart, monthStart }

  const [
    { data: bookings },
    { data: extensions },
    { data: giftCards },
    { data: memberships },
    { data: renewalLogs },
  ] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("total, gift_card_applied, refund_amount, paid_at, status")
      .gte("paid_at", yearStart.toISOString())
      .not("paid_at", "is", null),
    // Extensions are their own source, bucketed by when the extension was
    // bought rather than when the original booking was paid for - an
    // extension sold tonight on yesterday's booking belongs to tonight.
    serviceClient
      .from("bookings")
      .select("extension_revenue, last_extended_at")
      .gt("extension_revenue", 0)
      .gte("last_extended_at", yearStart.toISOString())
      .not("last_extended_at", "is", null),
    serviceClient
      .from("gift_cards")
      .select("original_amount, created_at, stripe_payment_id")
      .gte("created_at", yearStart.toISOString()),
    serviceClient
      .from("memberships")
      .select("started_at, plan_type, granted_free, signup_amount_paid, membership_plans(price_monthly, joining_fee)")
      .gte("started_at", yearStart.toISOString()),
    serviceClient
      .from("admin_logs")
      .select("detail, created_at")
      .eq("event", "invoice-paid-subscription_cycle")
      .gte("created_at", yearStart.toISOString()),
  ])

  const bookingBuckets = emptyBuckets()
  const extensionBuckets = emptyBuckets()
  const giftBuckets = emptyBuckets()
  const memBuckets = emptyBuckets()
  const renewalBuckets = emptyBuckets()

  for (const b of (bookings ?? []) as Array<{
    total: number; gift_card_applied: number | null; refund_amount: number | null
    paid_at: string; status: string
  }>) {
    const cash = Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0)
    if (cash > 0) addToBuckets(bookingBuckets, cash, new Date(b.paid_at), boundaries)
  }

  // Extensions are charged on their own PaymentIntent and never touched
  // `total`, so every dollar customers paid to add time was missing from
  // revenue entirely until 2026-09-12. Reported separately rather than folded
  // into bookings: a booking still shows what it was sold for, and added time
  // is visible as its own line of business. Extensions from before the column
  // existed carry 0 and no timestamp, so they simply do not appear - that
  // money was never recorded anywhere to recover.
  for (const e of (extensions ?? []) as Array<{
    extension_revenue: number | null; last_extended_at: string
  }>) {
    const amount = Number(e.extension_revenue ?? 0)
    if (amount > 0) addToBuckets(extensionBuckets, amount, new Date(e.last_extended_at), boundaries)
  }

  for (const g of (giftCards ?? []) as Array<{
    original_amount: number; created_at: string; stripe_payment_id: string | null
  }>) {
    // Admin-issued cards (/admin/gift-cards) carry no Stripe payment - they're
    // comps, so their face value is a liability we owe, not money we took in.
    if (!g.stripe_payment_id) continue
    addToBuckets(giftBuckets, Number(g.original_amount), new Date(g.created_at), boundaries)
  }

  for (const m of (memberships ?? []) as Array<{
    started_at: string; plan_type: string; granted_free: boolean | null
    signup_amount_paid: number | null
    membership_plans: { price_monthly: number; joining_fee: number | null } | null
  }>) {
    // Free grants (admin direct grant / giveaway code) collect nothing at
    // signup - see memberships.granted_free. Counting their sticker price is
    // what put $88 of "September signups" on /admin/sales when $78 of it was
    // two year-long free grants. Their eventual paid renewals still land in
    // the renewals bucket below once Stripe actually charges them.
    if (m.granted_free) continue
    const signupRevenue = membershipSignupRevenue(m)
    if (signupRevenue === null) continue
    addToBuckets(memBuckets, signupRevenue, new Date(m.started_at), boundaries)
  }

  // Parse renewal amounts from admin_logs detail string: "birdie – John Smith sub=sub_xxx amount=$29.00"
  for (const r of (renewalLogs ?? []) as Array<{ detail: string; created_at: string }>) {
    const match = r.detail.match(/amount=\$([0-9.]+)/)
    if (match) addToBuckets(renewalBuckets, parseFloat(match[1]), new Date(r.created_at), boundaries)
  }

  const total: RevenueBuckets = {
    today: bookingBuckets.today + extensionBuckets.today + giftBuckets.today + memBuckets.today + renewalBuckets.today,
    week: bookingBuckets.week + extensionBuckets.week + giftBuckets.week + memBuckets.week + renewalBuckets.week,
    mtd: bookingBuckets.mtd + extensionBuckets.mtd + giftBuckets.mtd + memBuckets.mtd + renewalBuckets.mtd,
    ytd: bookingBuckets.ytd + extensionBuckets.ytd + giftBuckets.ytd + memBuckets.ytd + renewalBuckets.ytd,
  }

  return {
    bookings: bookingBuckets,
    extensions: extensionBuckets,
    giftCards: giftBuckets,
    memberships: memBuckets,
    renewals: renewalBuckets,
    total,
  }
}

/* ------------------------------------------------------------------ *
 * Drill-down: the individual rows behind each number on /admin/sales. *
 * ------------------------------------------------------------------ */

export type RevenueSource = "bookings" | "extensions" | "giftCards" | "memberships" | "renewals"
export type PeriodKey = keyof RevenueBuckets

export const REVENUE_SOURCE_LABELS: Record<RevenueSource, string> = {
  bookings: "Bay bookings",
  extensions: "Bay extensions",
  giftCards: "Gift cards sold",
  memberships: "Membership sign-ups",
  renewals: "Membership renewals",
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
]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  week: "Last 7 days",
  mtd: "Month to date",
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
  const { todayStart, weekStart, monthStart, yearStart } = computePeriodBoundaries()
  if (period === "today") return todayStart
  if (period === "week") return weekStart
  if (period === "mtd") return monthStart
  return yearStart
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
  const since = startForPeriod(period).toISOString()
  const name = (p: PersonRef) =>
    p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown" : "Unknown"

  if (source === "bookings") {
    const { data } = await serviceClient
      .from("bookings")
      .select("id, total, gift_card_applied, refund_amount, paid_at, status, bays(name), profiles!user_id(first_name, last_name)")
      .gte("paid_at", since)
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

  const { data } = await serviceClient
    .from("admin_logs")
    .select("detail, created_at")
    .eq("event", "invoice-paid-subscription_cycle")
    .gte("created_at", since)
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
