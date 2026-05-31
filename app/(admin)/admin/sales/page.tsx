import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { computeRevenue } from "@/lib/admin/revenue"

export const metadata = { title: "Sales | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminSalesPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const revenue = await computeRevenue(serviceClient)
  const fmt = (n: number) => `$${n.toFixed(2)}`

  const periods = [
    { key: "today" as const, label: "Today" },
    { key: "week" as const, label: "Last 7 days" },
    { key: "mtd" as const, label: "Month to date" },
    { key: "ytd" as const, label: "Year to date" },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sales</h1>
          <p className="text-xs text-neutral-500 mt-1">Initial sign-up revenue only &mdash; recurring membership renewals not yet tracked here.</p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>
      </div>

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

      <div className="rounded-xl border border-white/10 overflow-hidden">
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
            <tr className="border-t border-white/10 font-semibold text-white bg-white/[0.03]">
              <td className="px-4 py-3">Total</td>
              {periods.map(p => <td key={p.key} className="px-4 py-3 text-right">{fmt(revenue.total[p.key])}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        Bay bookings shown as cash received (booking total minus gift-card applied minus refunds).
        Gift cards shown at face value (what the buyer paid). Memberships shown as first month + joining fee per signup.
      </p>
    </main>
  )
}
