import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Cancellations | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminCancellationsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { days = "30" } = await searchParams
  const daysNum = parseInt(days, 10) || 30
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString()

  const { data: cancellations } = await serviceClient
    .from("bookings")
    .select("id, user_id, starts_at, ends_at, total, refund_amount, refunded_at, cancelled_at, bays(name), profiles!user_id(first_name, last_name)")
    .eq("status", "cancelled")
    .not("cancelled_at", "is", null)
    .gte("cancelled_at", since)
    .order("cancelled_at", { ascending: false })

  const rows = (cancellations ?? []) as Array<{
    id: string; user_id: string; starts_at: string; ends_at: string;
    total: number; refund_amount: number | null; cancelled_at: string;
    bays: { name: string } | null;
    profiles: { first_name: string; last_name: string } | null;
  }>

  const totalForfeited = rows.reduce((sum, b) => sum + (Number(b.refund_amount ?? 0) === 0 ? Number(b.total) : 0), 0)
  const totalRefunded = rows.reduce((sum, b) => sum + Number(b.refund_amount ?? 0), 0)

  const FILTERS = [
    { days: 7, label: "Last 7 days" },
    { days: 30, label: "Last 30 days" },
    { days: 90, label: "Last 90 days" },
    { days: 365, label: "Last year" },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cancellations</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Watch for refund_amount &gt; 0 on bookings cancelled shortly after creation &mdash; may indicate the reschedule-to-escape-forfeit pattern.
          </p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Cancellations</p>
          <p className="mt-1 text-2xl font-semibold text-white">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Total forfeited</p>
          <p className="mt-1 text-2xl font-semibold text-red-400">${totalForfeited.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Total refunded</p>
          <p className="mt-1 text-2xl font-semibold text-green-400">${totalRefunded.toFixed(2)}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Link key={f.days} href={`/admin/cancellations?days=${f.days}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              daysNum === f.days ? "text-black" : "bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10"
            }`}
            style={daysNum === f.days ? { backgroundColor: "var(--brand)" } : undefined}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 py-10 text-center">No cancellations in this window.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Booked slot</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Refunded</th>
                <th className="px-4 py-3">Cancelled at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const forfeit = Number(b.refund_amount ?? 0) === 0
                return (
                  <tr key={b.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${b.user_id}`} className="hover:text-brand">
                        {b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.bays?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(b.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Indiana/Indianapolis" })}{" "}
                      {new Date(b.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                    </td>
                    <td className="px-4 py-3">${Number(b.total).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${forfeit ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                        {forfeit ? "Forfeited" : `$${Number(b.refund_amount).toFixed(2)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {new Date(b.cancelled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
