import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { filterRealCancellations, filterAbandonedCheckouts } from "@/lib/admin/cancellations"

export const metadata = { title: "Cancellations | Tee365 Admin" }
export const dynamic = "force-dynamic"

type Row = {
  id: string; user_id: string; starts_at: string; ends_at: string
  total: number; refund_amount: number | null; refunded_at: string | null
  paid_at: string | null; cancelled_at: string; credit_hours_applied: number | null
  bays: { name: string } | null
  profiles: { first_name: string; last_name: string } | null
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

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

  const COLS = "id, user_id, starts_at, ends_at, total, refund_amount, refunded_at, paid_at, cancelled_at, credit_hours_applied, bays(name), profiles!user_id(first_name, last_name)"

  // Two queries rather than one filtered in memory, so this page and the
  // dashboard's count card are answering with the exact same definition.
  // See lib/admin/cancellations.ts - a never-paid booking is not a
  // cancellation, and splitting them here is what made the numbers honest.
  const [{ data: cancelledRows }, { data: abandonedRows }] = await Promise.all([
    filterRealCancellations(serviceClient.from("bookings").select(COLS), since)
      .order("cancelled_at", { ascending: false }),
    filterAbandonedCheckouts(serviceClient.from("bookings").select(COLS), since)
      .order("cancelled_at", { ascending: false }),
  ])

  const cancellations = (cancelledRows ?? []) as Row[]
  const abandoned = (abandonedRows ?? []) as Row[]

  const forfeited = (b: Row) => Number(b.total) > 0 && Number(b.refund_amount ?? 0) === 0
  const totalForfeited = cancellations.filter(forfeited).reduce((s, b) => s + Number(b.total), 0)

  // Only money that was actually taken can be given back, so this counts paid
  // bookings only. One row carries refund_amount 30.00 against paid_at null
  // and refunded_at null - a refund recorded for a payment that never
  // happened. It is surfaced as a data problem below rather than quietly
  // inflating this figure, which is what made the card disagree with the list.
  const totalRefunded = cancellations.reduce((s, b) => s + Number(b.refund_amount ?? 0), 0)

  // Hour-credit bookings cancel at $0 because no cash was ever involved.
  // Reporting those as "Forfeited $0.00" says nothing: what they actually
  // forfeit is credit hours, so they are counted in their own unit.
  const creditHoursForfeited = cancellations
    .filter((b) => Number(b.total) === 0 && Number(b.credit_hours_applied ?? 0) > 0)
    .reduce((s, b) => s + Number(b.credit_hours_applied ?? 0), 0)

  const phantomRefunds = abandoned.filter((b) => Number(b.refund_amount ?? 0) > 0)

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
            Bookings that were paid for and then cancelled. Checkouts that were never completed are
            listed separately at the bottom, because nobody cancelled those.
          </p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Cancellations</p>
          <p className="mt-1 text-2xl font-semibold text-white">{cancellations.length}</p>
          <p className="mt-0.5 text-[11px] text-neutral-600">paid, then cancelled</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Total forfeited</p>
          <p className="mt-1 text-2xl font-semibold text-red-400">${totalForfeited.toFixed(2)}</p>
          {creditHoursForfeited > 0 && (
            <p className="mt-0.5 text-[11px] text-neutral-600">
              plus {creditHoursForfeited} credit {creditHoursForfeited === 1 ? "hour" : "hours"}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Total refunded</p>
          <p className="mt-1 text-2xl font-semibold text-green-400">${totalRefunded.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-neutral-500">Abandoned checkouts</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-300">{abandoned.length}</p>
          <p className="mt-0.5 text-[11px] text-neutral-600">not cancellations</p>
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

      {phantomRefunds.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-300">
            {phantomRefunds.length === 1 ? "A booking has" : `${phantomRefunds.length} bookings have`}{" "}
            a refund recorded against a payment that never happened
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
            {phantomRefunds.map((b) => (
              <li key={b.id}>
                {b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "Unknown"} &middot;{" "}
                {b.bays?.name ?? "Bay ?"} &middot; refund_amount ${Number(b.refund_amount).toFixed(2)}, no payment
                {b.refunded_at ? "" : ", no refund timestamp"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-200/60">
            Not counted as refunded above. No money left the account, but the stored figure is wrong
            and is what made the refunded total disagree with the list.
          </p>
        </div>
      )}

      {cancellations.length === 0 ? (
        <p className="text-sm text-neutral-500 py-10 text-center">No paid bookings were cancelled in this window.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Booked slot</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Cancelled at</th>
              </tr>
            </thead>
            <tbody>
              {cancellations.map((b) => {
                const refundAmt = Number(b.refund_amount ?? 0)
                const credits = Number(b.credit_hours_applied ?? 0)
                const zeroCash = Number(b.total) === 0

                let badge: { text: string; cls: string }
                if (refundAmt > 0) {
                  badge = { text: `$${refundAmt.toFixed(2)} refunded`, cls: "bg-green-500/20 text-green-400" }
                } else if (zeroCash && credits > 0) {
                  badge = {
                    text: `${credits} credit ${credits === 1 ? "hour" : "hours"} forfeited`,
                    cls: "bg-amber-500/20 text-amber-400",
                  }
                } else if (zeroCash) {
                  badge = { text: "No charge", cls: "bg-neutral-500/20 text-neutral-400" }
                } else {
                  badge = { text: `$${Number(b.total).toFixed(2)} forfeited`, cls: "bg-red-500/20 text-red-400" }
                }

                return (
                  <tr key={b.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${b.user_id}`} className="hover:text-brand">
                        {b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "N/A"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.bays?.name ?? "N/A"}</td>
                    <td className="px-4 py-3 text-xs">{fmtWhen(b.starts_at)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      ${Number(b.total).toFixed(2)}
                      {zeroCash && credits > 0 && (
                        <span className="ml-1 text-xs text-neutral-500">({credits} hr credit)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{fmtWhen(b.cancelled_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abandoned.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white">Abandoned checkouts</h2>
          <p className="mt-1 mb-4 text-xs text-neutral-500">
            A slot was held, payment was never completed, and the hold was released automatically.
            No money was involved and nobody cancelled anything. Worth watching as lost conversions,
            not lost revenue.
          </p>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Slot they were holding</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Released at</th>
                </tr>
              </thead>
              <tbody>
                {abandoned.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 text-neutral-400 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${b.user_id}`} className="hover:text-brand">
                        {b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "N/A"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.bays?.name ?? "N/A"}</td>
                    <td className="px-4 py-3 text-xs">{fmtWhen(b.starts_at)}</td>
                    <td className="px-4 py-3 tabular-nums text-neutral-500">${Number(b.total).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{fmtWhen(b.cancelled_at)}</td>
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
