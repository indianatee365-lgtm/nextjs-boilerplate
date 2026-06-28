import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { computeRevenue } from "@/lib/admin/revenue"

export const metadata = { title: "Sales | Tee365 Admin" }
export const dynamic = "force-dynamic"

type Membership = {
  id: string
  status: string
  started_at: string
  current_period_end: string | null
  plan_type: string
  stripe_subscription_id: string | null
  membership_plans: { name: string; price_monthly: number } | null
  profiles: { first_name: string; last_name: string } | null
}

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const [revenue, { data: subsRaw }] = await Promise.all([
    computeRevenue(serviceClient),
    serviceClient
      .from("memberships")
      .select(`id, status, started_at, current_period_end, plan_type, stripe_subscription_id,
        membership_plans(name, price_monthly),
        profiles!user_id(first_name, last_name)`)
      .in("status", ["active", "past_due"])
      .order("started_at", { ascending: false }),
  ])

  const subs = (subsRaw ?? []) as Membership[]
  const fmt = (n: number) => `$${n.toFixed(2)}`

  const periods = [
    { key: "today" as const, label: "Today" },
    { key: "week" as const, label: "Last 7 days" },
    { key: "mtd" as const, label: "Month to date" },
    { key: "ytd" as const, label: "Year to date" },
  ]

  const statusBadge = (s: string) => {
    if (s === "active") return "bg-green-500/20 text-green-400"
    if (s === "past_due") return "bg-yellow-500/20 text-yellow-400"
    return "bg-neutral-500/20 text-neutral-400"
  }

  const mrr = subs
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + Number(s.membership_plans?.price_monthly ?? 0), 0)

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {periods.map(p => (
            <div key={p.key}>
              <p className="text-xs text-neutral-500 uppercase tracking-widest">{p.label}</p>
              <p className="mt-1 text-3xl font-bold text-white">{fmt(revenue.total[p.key])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="rounded-xl border border-white/10 overflow-hidden mb-10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Source</th>
              {periods.map(p => <th key={p.key} className="px-4 py-3 text-right">{p.label}</th>)}
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            <tr className="border-t border-white/5">
              <td className="px-4 py-3">Bay bookings</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.bookings[p.key])}</td>)}
            </tr>
            <tr className="border-t border-white/5">
              <td className="px-4 py-3">Gift cards sold</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.giftCards[p.key])}</td>)}
            </tr>
            <tr className="border-t border-white/5">
              <td className="px-4 py-3">Membership sign-ups</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.memberships[p.key])}</td>)}
            </tr>
            <tr className="border-t border-white/5">
              <td className="px-4 py-3">Membership renewals</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.renewals[p.key])}</td>)}
            </tr>
            <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.03]">
              <td className="px-4 py-3">Total</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.total[p.key])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Active subscriptions */}
      <div className="flex items-baseline gap-4 mb-4">
        <h2 className="text-lg font-semibold text-white">Active Subscriptions</h2>
        <span className="text-xs text-neutral-500">{subs.length} subscriber{subs.length !== 1 ? "s" : ""}</span>
        <span className="ml-auto text-xs text-neutral-400">MRR <span className="text-white font-semibold">{fmt(mrr)}</span></span>
      </div>

      {subs.length === 0 ? (
        <p className="text-sm text-neutral-500">No active subscriptions.</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
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
                const name = p ? `${p.first_name} ${p.last_name}`.trim() : "—"
                const started = s.started_at ? new Date(s.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"
                const renewal = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"
                return (
                  <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{name}</td>
                    <td className="px-4 py-3 capitalize">{s.membership_plans?.name ?? s.plan_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(s.status)}`}>{s.status.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{started}</td>
                    <td className="px-4 py-3 text-neutral-400">{renewal}</td>
                    <td className="px-4 py-3 text-right">{fmt(Number(s.membership_plans?.price_monthly ?? 0))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        Bay bookings shown as cash received (total minus gift-card applied minus refunds).
        Gift cards shown at face value. Membership sign-ups include first month + joining fee. Renewals pulled from Stripe webhook events.
      </p>
    </main>
  )
}
