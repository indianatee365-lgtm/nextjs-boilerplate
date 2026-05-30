import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Calendar, Users, Clock, Tag, Gift, UserCircle } from "lucide-react"

export const metadata = { title: "Admin | Tee365" }

export default async function AdminPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/account")

  // Use Eastern time for "today" window
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" }))
  const today = new Date(nowET)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  // Convert back to UTC for DB queries
  const etOffset = new Date().getTime() - nowET.getTime()
  const todayUTC = new Date(today.getTime() + etOffset)
  const tomorrowUTC = new Date(tomorrow.getTime() + etOffset)

  const [{ count: todayCount }, { count: pendingCount }, { count: founderCount }, { count: otherMemberCount }, { count: logsCount24h }, { count: failureCount24h }, { data: recentBookings }, { data: recentCancellations }, { data: activeCoupons }] =
    await Promise.all([
      serviceClient
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", todayUTC.toISOString())
        .lt("starts_at", tomorrowUTC.toISOString())
        .in("status", ["confirmed"]),
      serviceClient
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      serviceClient
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("plan_type", "founder")
        .in("status", ["active", "past_due"]),
      serviceClient
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .neq("plan_type", "founder")
        .in("status", ["active", "past_due"]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (serviceClient as any)
        .from("admin_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (serviceClient as any)
        .from("admin_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .ilike("event", "%FAILED%"),
      serviceClient
        .from("bookings")
        .select("id, starts_at, ends_at, status, total, bays(name), profiles!user_id(first_name, last_name)")
        .in("status", ["confirmed", "pending"])
        .gte("starts_at", todayUTC.toISOString())
        .order("starts_at")
        .limit(10),
      serviceClient
        .from("bookings")
        .select("id, starts_at, ends_at, total, refund_amount, refunded_at, cancelled_at, bays(name), profiles!user_id(first_name, last_name)")
        .eq("status", "cancelled")
        .not("cancelled_at", "is", null)
        .order("cancelled_at", { ascending: false })
        .limit(20),
      serviceClient
        .from("coupons")
        .select("id, name, code, discount_type, discount_value, uses_count, max_uses, expires_at")
        .eq("active", true)
        .order("uses_count", { ascending: false })
        .limit(5),
    ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard icon={<Calendar size={18} />} label="Bookings today" value={String(todayCount ?? 0)} />
        <StatCard icon={<Clock size={18} />} label="Pending payment" value={String(pendingCount ?? 0)} href="/admin/bookings?status=pending" />
        <StatCard icon={<Users size={18} />} label="Founders" value={`${founderCount ?? 0} / 100`} href="/admin/members?plan=founder" />
        <StatCard icon={<Users size={18} />} label="Other members" value={String(otherMemberCount ?? 0)} href="/admin/members" />
        <StatCard
          icon={<Clock size={18} />}
          label={(failureCount24h ?? 0) > 0 ? "Failures (24h) — CHECK" : "System health (24h)"}
          value={`${failureCount24h ?? 0} / ${logsCount24h ?? 0}`}
          href={(failureCount24h ?? 0) > 0 ? "/admin/logs?filter=failures" : "/admin/logs?filter=all"}
        />
      </div>

      {/* Nav */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { href: "/admin/bookings", icon: <Calendar size={16} />, label: "Manage Bookings" },
          { href: "/admin/bays", icon: <Clock size={16} />, label: "Bays & Block Times" },
          { href: "/admin/members", icon: <Users size={16} />, label: "Members" },
          { href: "/admin/users", icon: <UserCircle size={16} />, label: "Users" },
          { href: "/admin/coupons", icon: <Tag size={16} />, label: "Coupons" },
          { href: "/admin/gift-cards", icon: <Gift size={16} />, label: "Gift Cards" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            target={(item as { target?: string }).target}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-300 transition hover:border-brand/40 hover:bg-brand/10 hover:text-white"
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>

      {/* Today's bookings */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Today&apos;s bookings</h2>
        {recentBookings && recentBookings.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => {
                  const profile = b.profiles as { first_name: string; last_name: string } | null
                  const bay = b.bays as { name: string } | null
                  return (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">{profile ? `${profile.first_name} ${profile.last_name}` : "—"}</td>
                      <td className="px-4 py-3">{bay?.name}</td>
                      <td className="px-4 py-3">
                        {new Date(b.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                        {" – "}
                        {new Date(b.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      </td>
                      <td className="px-4 py-3">${Number(b.total).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.status === "confirmed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No bookings today.</p>
        )}
      </div>

      {/* Cancellations & reschedules */}
      <div className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-white">Recent cancellations</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Watch for refund_amount &gt; 0 on bookings cancelled shortly after creation — may indicate the reschedule-to-escape-forfeit pattern.
        </p>
        {recentCancellations && recentCancellations.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Booked slot</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Refunded</th>
                  <th className="px-4 py-3">Cancelled at</th>
                </tr>
              </thead>
              <tbody>
                {recentCancellations.map((b) => {
                  const profile = b.profiles as { first_name: string; last_name: string } | null
                  const bay = b.bays as { name: string } | null
                  const forfeit = Number(b.refund_amount ?? 0) === 0
                  return (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">{profile ? `${profile.first_name} ${profile.last_name}` : "—"}</td>
                      <td className="px-4 py-3">{bay?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {new Date(b.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Indiana/Indianapolis" })}
                        {" "}
                        {new Date(b.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      </td>
                      <td className="px-4 py-3">${Number(b.total).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${forfeit ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
                          {forfeit ? "Forfeited" : `$${Number(b.refund_amount).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {b.cancelled_at ? new Date(b.cancelled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" }) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No cancellations yet.</p>
        )}
      </div>

      {/* Active coupons */}
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Active coupons</h2>
          <a href="/admin/coupons" className="text-xs text-brand hover:underline">Manage →</a>
        </div>
        {activeCoupons && activeCoupons.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-white/10">
                <th className="pb-2">Code</th>
                <th className="pb-2">Name</th>
                <th className="pb-2">Discount</th>
                <th className="pb-2">Uses</th>
                <th className="pb-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {activeCoupons.map((c) => (
                <tr key={c.id} className="border-b border-white/5 text-neutral-300">
                  <td className="py-2 font-mono text-xs font-medium">{c.code}</td>
                  <td className="py-2 text-neutral-400 text-xs">{(c as any).name ?? "—"}</td>
                  <td className="py-2">{c.discount_type === "percent" ? `${c.discount_value}%` : `$${Number(c.discount_value).toFixed(2)}`}</td>
                  <td className="py-2">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                  <td className="py-2 text-neutral-400 text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">No active coupons.</p>
        )}
      </div>
    </main>
  )
}

function StatCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  const inner = (
    <div className={["rounded-xl border border-white/10 bg-white/5 px-4 py-4", href ? "transition hover:border-brand/40 hover:bg-brand/10" : ""].join(" ")}>
      <div className="flex items-center gap-2 text-neutral-400">{icon}<span className="text-xs">{label}</span></div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
