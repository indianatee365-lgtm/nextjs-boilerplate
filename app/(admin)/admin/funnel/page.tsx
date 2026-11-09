import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Booking Funnel | Admin | Tee365" }
export const dynamic = "force-dynamic"

// Each visitor counts once, at the furthest step they reached, and again at
// every step before it. Quick-book and texted /book?date= links skip the
// calendar, so "picked a date" would otherwise read lower than the step after it.
const STAGES = [
  { key: "view", label: "Opened /book" },
  { key: "date", label: "Picked a date" },
  { key: "time", label: "Picked a time (review page)" },
  { key: "reserved", label: "Reached payment" },
  { key: "paid", label: "Paid" },
] as const

type FunnelRow = { session_id: string; step: string; booking_id: string | null; user_id: string | null }

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/account")

  const days = (await searchParams).days === "7" ? 7 : 30
  const since = new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: rows }, { data: admins }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("booking_funnel_events")
      .select("session_id, step, booking_id, user_id").gte("created_at", since).limit(50000),
    serviceClient.from("profiles").select("id").eq("role", "admin"),
  ])
  const adminIds = new Set((admins ?? []).map(a => a.id))
  const events = ((rows ?? []) as FunnelRow[])

  // Sessions where an admin was signed in at any step are testing, not customers.
  const adminSessions = new Set(events.filter(e => e.user_id && adminIds.has(e.user_id)).map(e => e.session_id))
  const customerEvents = events.filter(e => !adminSessions.has(e.session_id))

  const reservedIds = customerEvents.map(e => e.booking_id).filter((id): id is string => !!id)
  const { data: confirmed } = reservedIds.length
    ? await serviceClient.from("bookings").select("id").in("id", reservedIds).eq("status", "confirmed")
    : { data: [] }
  const paidIds = new Set((confirmed ?? []).map(b => b.id))

  const furthest = new Map<string, number>()
  const sentToLogin = new Set<string>()
  for (const e of customerEvents) {
    if (e.step === "login") { sentToLogin.add(e.session_id); continue }
    let stage = STAGES.findIndex(s => s.key === e.step)
    if (e.step === "reserved" && e.booking_id && paidIds.has(e.booking_id)) stage = STAGES.length - 1
    if (stage > (furthest.get(e.session_id) ?? -1)) furthest.set(e.session_id, stage)
  }
  const counts = STAGES.map((_, i) => [...furthest.values()].filter(v => v >= i).length)
  const top = counts[0] || 1

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin" className="text-sm text-neutral-400 hover:text-white">← Admin</Link>
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Booking Funnel</h1>
        <div className="flex gap-2 text-sm">
          {[7, 30].map(d => (
            <Link
              key={d}
              href={`/admin/funnel?days=${d}`}
              className={`rounded-lg border px-3 py-1 ${d === days ? "border-brand/40 bg-brand/10 text-white" : "border-white/10 text-neutral-400 hover:text-white"}`}
            >
              {d} days
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Visitors to /book in the last {days} days, by the furthest step they reached. Admin test visits are left out. Tracking started November 9, 2026.
      </p>

      <div className="mt-6 space-y-3">
        {STAGES.map((s, i) => {
          const pct = Math.round((counts[i] / top) * 100)
          const lost = i > 0 ? counts[i - 1] - counts[i] : 0
          return (
            <div key={s.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-300">{s.label}</span>
                <span className="text-lg font-semibold text-white">
                  {counts[i]} <span className="text-sm font-normal text-neutral-500">({pct}%)</span>
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              {lost > 0 && <p className="mt-2 text-xs text-red-300">{lost} stopped before this step</p>}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-sm text-neutral-400">
        Sent to sign in or create an account before reserving: <span className="text-white">{sentToLogin.size}</span>
      </p>
    </main>
  )
}
