import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  computeRevenue, computeMrr, mrrContribution,
  COMPARISON_LABELS, PERIOD_LABELS, REVENUE_SOURCE_LABELS, REVENUE_SOURCE_ORDER,
  type PeriodKey,
} from "@/lib/admin/revenue"
import { computeSalesInsights, DAYPARTS, WEEKDAYS } from "@/lib/admin/monthly"

export const metadata = { title: "Sales | Tee365 Admin" }
export const dynamic = "force-dynamic"

type Membership = {
  id: string
  status: string
  started_at: string
  current_period_end: string | null
  plan_type: string
  stripe_subscription_id: string | null
  comped: boolean | null
  granted_free: boolean | null
  membership_paused: boolean | null
  is_annual: boolean | null
  membership_plans: { name: string; price_monthly: number } | null
  profiles: { first_name: string; last_name: string } | null
}

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

function Change({ now, before }: { now: number; before: number | null }) {
  if (before === null) return null
  if (before === 0) {
    return now > 0 ? <span className="text-green-400">▲</span> : <span className="text-neutral-600">no change</span>
  }
  const pct = ((now - before) / before) * 100
  const up = pct >= 0
  return (
    <span className={up ? "text-green-400" : "text-red-400"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const [revenue, insights, { data: subsRaw }] = await Promise.all([
    computeRevenue(serviceClient),
    computeSalesInsights(serviceClient),
    serviceClient
      .from("memberships")
      .select(`id, status, started_at, current_period_end, plan_type, stripe_subscription_id,
        comped, granted_free, membership_paused, is_annual,
        membership_plans(name, price_monthly),
        profiles!user_id(first_name, last_name)`)
      .in("status", ["active", "past_due"])
      .order("started_at", { ascending: false }),
  ])

  const subs = (subsRaw ?? []) as Membership[]

  const periods: PeriodKey[] = ["today", "week", "mtd", "lastMonth", "ytd"]

  // Every cell links to /admin/sales/[source] so a number that looks wrong can
  // be opened to see the individual rows behind it, including the ones
  // deliberately excluded from revenue and why.
  // Order and labels both come from lib/admin/revenue.ts so this page cannot
  // drift out of agreement with the dashboard about either. Sources with no
  // money yet this year or last month are hidden until they earn something.
  const sourceRows = REVENUE_SOURCE_ORDER
    .filter((source) => periods.some((p) => revenue[source][p] > 0))
    .map((source) => ({ source, label: REVENUE_SOURCE_LABELS[source] }))

  const statusBadge = (s: string) => {
    if (s === "active") return "bg-green-500/20 text-green-400"
    if (s === "past_due") return "bg-yellow-500/20 text-yellow-400"
    return "bg-neutral-500/20 text-neutral-400"
  }

  // Only what will actually be charged next cycle. Comped members, free grants
  // and anything prepaid past this billing period contribute nothing until they
  // renew. See lib/admin/revenue.ts for the rules and the reason on each row.
  const { mrr, deferred, billingCount, excludedCount } = computeMrr(subs)

  const { months, busiest } = insights
  const monthSources = REVENUE_SOURCE_ORDER.filter((s) => months.some((m) => m.revenue[s] > 0))
  const maxBusy = Math.max(...busiest.hours.flat(), 0.0001)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sales</h1>
        </div>
        <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>
      </div>

      {/* Revenue summary */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          {periods.map(p => (
            <div key={p}>
              <p className="text-xs text-neutral-500 uppercase tracking-widest">{PERIOD_LABELS[p]}</p>
              <p className="mt-1 text-3xl font-bold text-white">{fmt(revenue.total[p])}</p>
              {COMPARISON_LABELS[p] && revenue.previous[p] !== null && (
                <p className="mt-1 text-xs text-neutral-500">
                  <Change now={revenue.total[p]} before={revenue.previous[p]} />{" "}
                  {COMPARISON_LABELS[p]} ({fmt0(revenue.previous[p] ?? 0)})
                </p>
              )}
              {p === "mtd" && insights.projectedMonth !== null && (
                <p className="mt-0.5 text-xs text-neutral-500">On pace for {fmt0(insights.projectedMonth)}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="rounded-xl border border-white/10 overflow-x-auto mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Source</th>
              {periods.map(p => <th key={p} className="px-4 py-3 text-right">{PERIOD_LABELS[p]}</th>)}
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {sourceRows.map(row => (
              <tr key={row.source} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3">{row.label}</td>
                {periods.map(p => (
                  <td key={p} className="px-4 py-0 text-right">
                    <Link
                      href={`/admin/sales/${row.source}?period=${p}`}
                      className="block px-0 py-3 hover:text-white hover:underline"
                      title={`See what makes up ${row.label} for ${PERIOD_LABELS[p].toLowerCase()}`}
                    >
                      {fmt(revenue[row.source][p])}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.03]">
              <td className="px-4 py-3">Total</td>
              {periods.map(p => <td key={p} className="px-4 py-3 text-right">{fmt(revenue.total[p])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Month by month */}
      <h2 className="text-lg font-semibold text-white mb-1">Month by month</h2>
      <p className="text-xs text-neutral-500 mb-4">The current month is to date. Change compares each full month with the one before it.</p>
      <div className="rounded-xl border border-white/10 overflow-x-auto mb-6">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-right" title="Bookings played, not counting cancellations or admin tests">Sessions</th>
              <th className="px-4 py-3 text-right">Bay hours</th>
              <th className="px-4 py-3 text-right" title="Bay hours played out of 4 bays x 24 hours a day">Utilization</th>
              <th className="px-4 py-3 text-right" title="Bay booking and extension revenue per bay hour played">Per bay hour</th>
              <th className="px-4 py-3 text-right" title="Average cash collected per paid booking">Avg booking</th>
              <th className="px-4 py-3 text-right" title="People who played that month, and how many of them were playing for the first time">Customers (new)</th>
              <th className="px-4 py-3 text-right" title="Member, coupon, promo, veteran, free-hour and Grounds Crew discounts given">Discounts</th>
              <th className="px-4 py-3 text-right" title="Bookings cancelled that month, and what was refunded">Cancelled</th>
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {months.map((m, i) => {
              const prior = months[i + 1]
              return (
                <tr key={m.key} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">
                    {m.label}{m.partial && <span className="ml-2 text-xs text-neutral-500">to date</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-semibold">{fmt(m.total)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {m.partial
                      ? (insights.projectedMonth !== null ? <span className="text-neutral-500">pace {fmt0(insights.projectedMonth)}</span> : <span className="text-neutral-600">-</span>)
                      : prior ? <Change now={m.total} before={prior.total} /> : <span className="text-neutral-600">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{m.sessions}</td>
                  <td className="px-4 py-3 text-right">{m.bayHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">{m.utilization === null ? <span className="text-neutral-600">-</span> : `${m.utilization.toFixed(1)}%`}</td>
                  <td className="px-4 py-3 text-right">{fmt(m.revenuePerBayHour)}</td>
                  <td className="px-4 py-3 text-right">{fmt(m.avgBooking)}</td>
                  <td className="px-4 py-3 text-right">{m.customers} <span className="text-neutral-500">({m.newCustomers})</span></td>
                  <td className="px-4 py-3 text-right">{fmt(m.discounts)}</td>
                  <td className="px-4 py-3 text-right">
                    {m.cancellations}
                    {m.refunds > 0 && <span className="text-neutral-500"> ({fmt(m.refunds)})</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Revenue by source per month */}
      <div className="rounded-xl border border-white/10 overflow-x-auto mb-10">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Source</th>
              {months.map(m => <th key={m.key} className="px-4 py-3 text-right">{m.label}</th>)}
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {monthSources.map(s => (
              <tr key={s} className="border-t border-white/5">
                <td className="px-4 py-3">{REVENUE_SOURCE_LABELS[s]}</td>
                {months.map(m => <td key={m.key} className="px-4 py-3 text-right">{fmt(m.revenue[s])}</td>)}
              </tr>
            ))}
            <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.03]">
              <td className="px-4 py-3">Total</td>
              {months.map(m => <td key={m.key} className="px-4 py-3 text-right">{fmt(m.total)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Customers and what is owed */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {[
          { label: "Customers all time", value: insights.customersAllTime.toLocaleString("en-US"), hint: "People who have played at least once" },
          { label: "Repeat customers", value: `${insights.repeatRate.toFixed(0)}%`, hint: "Played more than once" },
          { label: "Gift card balance owed", value: fmt(insights.giftCardBalance), hint: "Unspent on purchased cards" },
          { label: "Comp card balance", value: fmt(insights.compGiftCardBalance), hint: "Unspent on cards you issued" },
          { label: "Free hours owed", value: insights.creditHoursOutstanding.toFixed(1), hint: "Unused, not expired" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-widest">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{c.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* Busiest times */}
      <h2 className="text-lg font-semibold text-white mb-1">Busiest times</h2>
      <p className="text-xs text-neutral-500 mb-4">
        Average bay hours played per week over the last {busiest.weeks} full weeks, by when the session started.
      </p>
      <div className="rounded-xl border border-white/10 overflow-x-auto mb-10">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Day</th>
              {DAYPARTS.map(d => <th key={d.key} className="px-4 py-3 text-right">{d.label}</th>)}
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3 text-right">Bay revenue</th>
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {WEEKDAYS.map((day, wi) => (
              <tr key={day} className="border-t border-white/5">
                <td className="px-4 py-3 text-white">{day}</td>
                {busiest.hours[wi].map((h, di) => (
                  <td key={di} className="px-4 py-3 text-right">
                    <span
                      className="inline-block min-w-12 rounded px-2 py-0.5"
                      style={{ backgroundColor: `rgba(34, 197, 94, ${(h / maxBusy) * 0.45})` }}
                    >
                      {h.toFixed(1)}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-3 text-right">{busiest.hours[wi].reduce((a, b) => a + b, 0).toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{fmt(busiest.revenue[wi])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active subscriptions */}
      <div className="flex items-baseline gap-4 mb-4">
        <h2 className="text-lg font-semibold text-white">Active Subscriptions</h2>
        <span className="text-xs text-neutral-500">{subs.length} subscriber{subs.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto text-xs text-neutral-400">
          MRR <span className="text-white font-semibold">{fmt(mrr)}</span>
          <span className="text-neutral-600"> · </span>
          {billingCount} billing
          {excludedCount > 0 && (
            <span title="Comped, free grants, paused, and anything prepaid past this cycle">
              <span className="text-neutral-600"> · </span>
              {excludedCount} not billing yet ({fmt(deferred)})
            </span>
          )}
        </span>
      </div>

      {subs.length === 0 ? (
        <p className="text-sm text-neutral-500">No active subscriptions.</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Next renewal</th>
                <th className="px-4 py-3 text-right">Monthly</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {subs.map(s => {
                const p = s.profiles
                const name = p ? `${p.first_name} ${p.last_name}`.trim() : "-"
                const started = s.started_at ? new Date(s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" }) : "-"
                const renewal = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" }) : "-"
                const contribution = mrrContribution(s)
                return (
                  <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{name}</td>
                    <td className="px-4 py-3 capitalize">{s.membership_plans?.name ?? s.plan_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(s.status)}`}>{s.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{started}</td>
                    <td className="px-4 py-3 text-neutral-400">{renewal}</td>
                    <td className="px-4 py-3 text-right">
                      {contribution.excludedReason === null ? (
                        fmt(contribution.amount)
                      ) : (
                        <>
                          <span className="text-neutral-600">{fmt(0)}</span>
                          <span className="block text-xs text-neutral-500">{contribution.excludedReason}</span>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        Click any amount in the top table to see the individual rows behind it.
        Bay bookings shown as cash received (total minus gift-card applied minus refunds), on the day paid.
        Bay extensions are counted separately, on the day the extension was bought rather than
        the day the original booking was paid for. Extensions from before 2026-09-12 are missing:
        the amount was never recorded at the time.
        Gift cards shown at face value, excluding admin-issued comps. Membership sign-ups include first month + joining fee,
        excluding free grants. Renewals pulled from Stripe webhook events. Private events, party tickets and league
        charges count when paid, and appear once they have any revenue.
        Month-by-month sessions, bay hours and customers go by when the session was played, so a booking paid in
        October for November shows its money in October and its hours in November.
        MRR counts only memberships that will actually be charged in the next cycle. Comped members,
        free grants, paused memberships and anything already paid up past this cycle show as $0 with
        the reason, and start counting on the day they renew.
      </p>
    </main>
  )
}
