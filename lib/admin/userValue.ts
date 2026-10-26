/**
 * What one customer has been worth: money collected and value given away,
 * month to date, year to date and lifetime. Shown on /admin/users/[id].
 *
 * Cash rules match computeRevenue() in ./revenue so a customer's numbers add
 * up to the same thing /admin/sales shows: bay cash is total minus gift card
 * and refunds by paid_at, extensions by last_extended_at, signups by what was
 * actually collected, renewals from the subscription_cycle invoice logs, gift
 * cards only when a Stripe payment exists.
 */
import Stripe from "stripe"
import { computePeriodBoundaries, membershipSignupRevenue } from "./revenue"

export type ValueBuckets = { mtd: number; ytd: number; lifetime: number }

export type UserValue = {
  cashIn: {
    bookings: ValueBuckets
    extensions: ValueBuckets
    memberships: ValueBuckets
    renewals: ValueBuckets
    giftCards: ValueBuckets
    total: ValueBuckets
  }
  givenAway: {
    membership: ValueBuckets
    coupons: ValueBuckets
    sales: ValueBuckets
    veteran: ValueBuckets
    freeHours: ValueBuckets
    groundsCrew: ValueBuckets
    freeMembership: ValueBuckets
    total: ValueBuckets
  }
  /** Cash in minus given away: the one bottom line. Added 2026-10-26 because
   * the two totals side by side, green and red, read as "this customer costs
   * us money" whenever the red one was bigger in a column. */
  net: ValueBuckets
  /** Paid for with a gift card someone already bought. Not new money, so not in cashIn. */
  giftCardRedeemed: ValueBuckets
  refunded: ValueBuckets
  hasData: boolean
}

const empty = (): ValueBuckets => ({ mtd: 0, ytd: 0, lifetime: 0 })

type BookingRow = {
  status: string
  starts_at: string
  paid_at: string | null
  total: number | null
  gift_card_applied: number | null
  refund_amount: number | null
  extension_revenue: number | null
  last_extended_at: string | null
  membership_discount: number | null
  coupon_discount: number | null
  promo_discount: number | null
  veteran_discount: number | null
  credit_discount: number | null
  grounds_crew_discount: number | null
}

type MembershipRow = {
  started_at: string
  granted_free: boolean | null
  comped: boolean | null
  is_annual: boolean | null
  signup_amount_paid: number | null
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  membership_plans: { price_monthly: number; joining_fee: number | null } | null
}

export async function computeUserValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  userId: string,
  fullName: string,
  profileCustomerId: string | null,
): Promise<UserValue> {
  const { monthStart, yearStart } = computePeriodBoundaries()
  const add = (b: ValueBuckets, amount: number, when: string | null) => {
    if (!amount || !when) return
    const t = new Date(when)
    b.lifetime += amount
    if (t >= yearStart) b.ytd += amount
    if (t >= monthStart) b.mtd += amount
  }

  const [{ data: bookingRows }, { data: membershipRows }, { data: giftRows }] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("status, starts_at, paid_at, total, gift_card_applied, refund_amount, extension_revenue, last_extended_at, membership_discount, coupon_discount, promo_discount, veteran_discount, credit_discount, grounds_crew_discount")
      .eq("user_id", userId),
    serviceClient
      .from("memberships")
      .select("started_at, granted_free, comped, is_annual, signup_amount_paid, stripe_subscription_id, stripe_customer_id, membership_plans(price_monthly, joining_fee)")
      .eq("user_id", userId),
    // Gift cards only carry the buyer's name, not their id. Same match the
    // "Gift cards purchased" table on this page has always used.
    serviceClient
      .from("gift_cards")
      .select("original_amount, created_at, stripe_payment_id")
      .eq("purchased_by", fullName),
  ])

  const bookings = (bookingRows ?? []) as BookingRow[]
  const memberships = (membershipRows ?? []) as MembershipRow[]
  const gifts = (giftRows ?? []) as Array<{ original_amount: number; created_at: string; stripe_payment_id: string | null }>

  // Monthly fees come straight from Stripe's paid invoices, the only complete
  // record: the webhook's renewal log lost the subscription id when Stripe
  // moved it under invoice.parent, and it missed some cycles entirely. The
  // sign-up charge is its own PaymentIntent (the subscription_create invoice
  // is $0), so only non-create invoices count here and sign-up stays below.
  const renewals: Array<{ amount: number; when: string }> = []
  const customerIds = [...new Set([profileCustomerId, ...memberships.map((m) => m.stripe_customer_id)].filter((c): c is string => !!c))]
  let stripeOk = customerIds.length > 0
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
    for (const customer of customerIds) {
      for await (const inv of stripe.invoices.list({ customer, status: "paid", limit: 100 })) {
        if (inv.billing_reason === "subscription_create" || !inv.amount_paid) continue
        const paidAt = inv.status_transitions?.paid_at ?? inv.created
        renewals.push({ amount: inv.amount_paid / 100, when: new Date(paidAt * 1000).toISOString() })
      }
    }
  } catch {
    stripeOk = false
  }
  if (!stripeOk && memberships.length > 0) {
    // Fallback when Stripe is unreachable: the renewal log, matched by name
    // since its sub= field reads "?" on most rows.
    const { data } = await serviceClient
      .from("admin_logs")
      .select("detail, created_at")
      .eq("event", "invoice-paid-subscription_cycle")
      .ilike("detail", `% – ${fullName} sub=%`)
    renewals.length = 0
    for (const r of (data ?? []) as Array<{ detail: string; created_at: string }>) {
      const match = r.detail.match(/amount=\$([0-9.]+)/)
      if (match) renewals.push({ amount: parseFloat(match[1]), when: r.created_at })
    }
  }

  const v: UserValue = {
    cashIn: { bookings: empty(), extensions: empty(), memberships: empty(), renewals: empty(), giftCards: empty(), total: empty() },
    givenAway: { membership: empty(), coupons: empty(), sales: empty(), veteran: empty(), freeHours: empty(), groundsCrew: empty(), freeMembership: empty(), total: empty() },
    net: empty(),
    giftCardRedeemed: empty(),
    refunded: empty(),
    hasData: bookings.length + memberships.length + gifts.length > 0,
  }

  for (const b of bookings) {
    if (b.paid_at) {
      const cash = Number(b.total ?? 0) - Number(b.gift_card_applied ?? 0) - Number(b.refund_amount ?? 0)
      if (cash > 0) add(v.cashIn.bookings, cash, b.paid_at)
      add(v.giftCardRedeemed, Number(b.gift_card_applied ?? 0), b.paid_at)
      add(v.refunded, Number(b.refund_amount ?? 0), b.paid_at)
    }
    add(v.cashIn.extensions, Number(b.extension_revenue ?? 0), b.last_extended_at)
    // A cancelled booking never used its discount, so it cost nothing.
    if (b.status === "cancelled") continue
    const when = b.paid_at ?? b.starts_at
    add(v.givenAway.membership, Number(b.membership_discount ?? 0), when)
    add(v.givenAway.coupons, Number(b.coupon_discount ?? 0), when)
    add(v.givenAway.sales, Number(b.promo_discount ?? 0), when)
    add(v.givenAway.veteran, Number(b.veteran_discount ?? 0), when)
    add(v.givenAway.freeHours, Number(b.credit_discount ?? 0), when)
    add(v.givenAway.groundsCrew, Number(b.grounds_crew_discount ?? 0), when)
  }

  for (const m of memberships) {
    const plan = m.membership_plans
    const sticker = plan ? Number(plan.price_monthly) + Number(plan.joining_fee ?? 0) : 0
    const paidNothing = m.signup_amount_paid === null || Number(m.signup_amount_paid) === 0
    if (m.granted_free || (m.comped && paidNothing)) {
      // Sign-up price waived. Later paid renewals still land in renewals.
      add(v.givenAway.freeMembership, sticker, m.started_at)
      continue
    }
    const collected = membershipSignupRevenue(m)
    if (collected !== null) add(v.cashIn.memberships, collected, m.started_at)
  }

  for (const r of renewals) add(v.cashIn.renewals, r.amount, r.when)

  for (const g of gifts) {
    if (g.stripe_payment_id) add(v.cashIn.giftCards, Number(g.original_amount), g.created_at)
  }

  const sum = (parts: ValueBuckets[]): ValueBuckets => ({
    mtd: parts.reduce((s, p) => s + p.mtd, 0),
    ytd: parts.reduce((s, p) => s + p.ytd, 0),
    lifetime: parts.reduce((s, p) => s + p.lifetime, 0),
  })
  const c = v.cashIn
  c.total = sum([c.bookings, c.extensions, c.memberships, c.renewals, c.giftCards])
  const g = v.givenAway
  g.total = sum([g.membership, g.coupons, g.sales, g.veteran, g.freeHours, g.groundsCrew, g.freeMembership])
  v.net = {
    mtd: c.total.mtd - g.total.mtd,
    ytd: c.total.ytd - g.total.ytd,
    lifetime: c.total.lifetime - g.total.lifetime,
  }
  if (c.total.lifetime + g.total.lifetime > 0) v.hasData = true
  return v
}
