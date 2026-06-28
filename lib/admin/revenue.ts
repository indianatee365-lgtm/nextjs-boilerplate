/**
 * Revenue bucketing helpers for the admin dashboard.
 *
 * One DB query per source (bookings / gift cards / memberships / renewals) since Jan 1.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function computeRevenue(serviceClient: any): Promise<RevenueBreakdown> {
  const { todayStart, weekStart, monthStart, yearStart } = computePeriodBoundaries()
  const boundaries = { todayStart, weekStart, monthStart }

  const [{ data: bookings }, { data: giftCards }, { data: memberships }, { data: renewalLogs }] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("total, gift_card_applied, refund_amount, paid_at, status")
      .gte("paid_at", yearStart.toISOString())
      .not("paid_at", "is", null),
    serviceClient
      .from("gift_cards")
      .select("original_amount, created_at")
      .gte("created_at", yearStart.toISOString()),
    serviceClient
      .from("memberships")
      .select("started_at, plan_type, membership_plans(price_monthly, joining_fee)")
      .gte("started_at", yearStart.toISOString()),
    serviceClient
      .from("admin_logs")
      .select("detail, created_at")
      .eq("event", "invoice-paid-subscription_cycle")
      .gte("created_at", yearStart.toISOString()),
  ])

  const bookingBuckets = emptyBuckets()
  const giftBuckets = emptyBuckets()
  const memBuckets = emptyBuckets()
  const renewalBuckets = emptyBuckets()

  for (const b of (bookings ?? []) as Array<{
    total: number; gift_card_applied: number | null; refund_amount: number | null; paid_at: string; status: string
  }>) {
    const cash = Number(b.total) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0)
    if (cash > 0) addToBuckets(bookingBuckets, cash, new Date(b.paid_at), boundaries)
  }

  for (const g of (giftCards ?? []) as Array<{ original_amount: number; created_at: string }>) {
    addToBuckets(giftBuckets, Number(g.original_amount), new Date(g.created_at), boundaries)
  }

  for (const m of (memberships ?? []) as Array<{
    started_at: string; plan_type: string; membership_plans: { price_monthly: number; joining_fee: number | null } | null
  }>) {
    const plan = m.membership_plans
    if (!plan) continue
    const signupRevenue = Number(plan.price_monthly) + Number(plan.joining_fee ?? 0)
    addToBuckets(memBuckets, signupRevenue, new Date(m.started_at), boundaries)
  }

  // Parse renewal amounts from admin_logs detail string: "birdie – John Smith sub=sub_xxx amount=$29.00"
  for (const r of (renewalLogs ?? []) as Array<{ detail: string; created_at: string }>) {
    const match = r.detail.match(/amount=\$([0-9.]+)/)
    if (match) addToBuckets(renewalBuckets, parseFloat(match[1]), new Date(r.created_at), boundaries)
  }

  const total: RevenueBuckets = {
    today: bookingBuckets.today + giftBuckets.today + memBuckets.today + renewalBuckets.today,
    week: bookingBuckets.week + giftBuckets.week + memBuckets.week + renewalBuckets.week,
    mtd: bookingBuckets.mtd + giftBuckets.mtd + memBuckets.mtd + renewalBuckets.mtd,
    ytd: bookingBuckets.ytd + giftBuckets.ytd + memBuckets.ytd + renewalBuckets.ytd,
  }

  return { bookings: bookingBuckets, giftCards: giftBuckets, memberships: memBuckets, renewals: renewalBuckets, total }
}
