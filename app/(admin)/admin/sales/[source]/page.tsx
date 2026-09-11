import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  getRevenueLineItems, startForPeriod,
  REVENUE_SOURCE_LABELS, PERIOD_LABELS,
  type RevenueSource, type PeriodKey,
} from "@/lib/admin/revenue"

export const metadata = { title: "Revenue detail | Tee365 Admin" }
export const dynamic = "force-dynamic"

const SOURCES = ["bookings", "giftCards", "memberships", "renewals"] as const
const PERIODS = ["today", "week", "mtd", "ytd"] as const

export default async function AdminSalesSourcePage({
  params, searchParams,
}: {
  params: Promise<{ source: string }>
  searchParams: Promise<{ period?: string }>
}) {
  const { source: sourceParam } = await params
  const { period: periodParam } = await searchParams

  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  if (!SOURCES.includes(sourceParam as RevenueSource)) notFound()
  const source = sourceParam as RevenueSource
  const period = (PERIODS.includes(periodParam as PeriodKey) ? periodParam : "mtd") as PeriodKey

  const items = await getRevenueLineItems(serviceClient, source, period)
  const counted = items.filter(i => !i.excludedReason)
  const excluded = items.filter(i => i.excludedReason)
  const total = counted.reduce((s, i) => s + i.amount, 0)
  const fmt = (n: number) => `$${n.toFixed(2)}`

  const when = (iso: string) => new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/sales" className="text-xs text-neutral-400 hover:text-white">&larr; Back to sales</Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold text-white">{REVENUE_SOURCE_LABELS[source]}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {PERIOD_LABELS[period]} · since {startForPeriod(period).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis",
          })} · <span className="text-white font-semibold">{fmt(total)}</span> from {counted.length} item{counted.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {PERIODS.map(p => (
          <Link
            key={p}
            href={`/admin/sales/${source}?period=${p}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              p === period ? "bg-white text-black" : "bg-white/5 text-neutral-400 hover:text-white"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {counted.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing in this period.</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {counted.map((i, idx) => (
                <tr key={idx} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap">{when(i.when)}</td>
                  <td className="px-4 py-3 font-medium text-white">
                    {i.href ? <Link href={i.href} className="hover:underline">{i.who}</Link> : i.who}
                  </td>
                  <td className="px-4 py-3 text-xs">{i.detail}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(i.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.03]">
                <td className="px-4 py-3" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {excluded.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Not counted as revenue ({excluded.length})
          </h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="text-neutral-400">
                {excluded.map((i, idx) => (
                  <tr key={idx} className="border-t border-white/5">
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{when(i.when)}</td>
                    <td className="px-4 py-3">
                      {i.href ? <Link href={i.href} className="hover:underline">{i.who}</Link> : i.who}
                    </td>
                    <td className="px-4 py-3 text-xs">{i.detail}</td>
                    <td className="px-4 py-3 text-xs text-yellow-400/80">{i.excludedReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
