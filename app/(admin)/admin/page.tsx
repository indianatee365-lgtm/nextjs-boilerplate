import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Calendar, Users, Clock, Tag, Gift, UserCircle, XCircle, DollarSign, TrendingUp, Phone } from "lucide-react"
import { computeRevenue } from "@/lib/admin/revenue"

export const metadata = { title: "Admin | Tee365" }
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/account")

  // Eastern-time "today" window
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" }))
  const today = new Date(nowET); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const etOffset = new Date().getTime() - nowET.getTime()
  const todayUTC = new Date(today.getTime() + etOffset)
  const tomorrowUTC = new Date(tomorrow.getTime() + etOffset)

  const [
    { count: todayCount },
    { count: pendingCount },
    { count: founderCount },
    { count: allMembersCount },
    { count: logsCount24h },
    { count: failureCount24h },
    { count: cancellations30d },
    { data: giftCardBalances },
    { data: recentBookings },
    { count: activeCouponCount },
    revenue,
  ] = await Promise.all([
    serviceClient.from("bookings").select("id", { count: "exact", head: true })
      .gte("starts_at", todayUTC.toISOString()).lt("starts_at", tomorrowUTC.toISOString()).in("status", ["confirmed"]),
    serviceClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    serviceClient.from("memberships").select("id", { count: "exact", head: true })
      .eq("plan_type", "founder").in("status", ["active", "past_due"]),
    serviceClient.from("memberships").select("id", { count: "exact", head: true })
      .in("status", ["active", "past_due"]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("admin_logs").select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("admin_logs").select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).ilike("event", "%FAILED%"),
    serviceClient.from("bookings").select("id", { count: "exact", head: true })
      .eq("status", "cancelled").gte("cancelled_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    serviceClient.from("gift_cards").select("balance, active"),
    serviceClient.from("bookings")
      .select("id, starts_at, ends_at, status, total, bays(name), profiles!user_id(first_name, last_name)")
      .in("status", ["confirmed", "pending"]).gte("starts_at", todayUTC.toISOString())
      .order("starts_at").limit(10),
    serviceClient.from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    computeRevenue(serviceClient),
  ])

  const liability = ((giftCardBalances ?? []) as Array<{ balance: number; active: boolean }>)
    .filter(g => g.active)
    .reduce((sum, g) => sum + Number(g.balance), 0)
  const fmtMoney = (n: number) => `$${n.toFixed(2)}`

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>

      {/* Operational stats: row 1 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Calendar size={18} />} label="Bookings today" value={String(todayCount ?? 0)} />
        <StatCard icon={<Clock size={18} />} label="Pending payment" value={String(pendingCount ?? 0)} href="/admin/bookings?status=pending" />
        <StatCard icon={<XCircle size={18} />} label="Cancellations (30d)" value={String(cancellations30d ?? 0)} href="/admin/cancellations" />
        <StatCard
          icon={<Clock size={18} />}
          label={(failureCount24h ?? 0) > 0 ? "Failures (24h) - CHECK" : "System health (24h)"}
          value={`${failureCount24h ?? 0} / ${logsCount24h ?? 0}`}
          href={(failureCount24h ?? 0) > 0 ? "/admin/logs?filter=failures" : "/admin/logs?filter=all"}
        />
      </div>

      {/* Membership & liability: row 2 */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<Users size={18} />} label="Founders" value={`${founderCount ?? 0} / 100`} href="/admin/members?plan=founder" />
        <StatCard icon={<Users size={18} />} label="All members" value={String(allMembersCount ?? 0)} href="/admin/members" />
        <StatCard icon={<Gift size={18} />} label="Gift card liability" value={fmtMoney(liability)} href="/admin/gift-cards" />
        <StatCard icon={<Tag size={18} />} label="Active coupons" value={String(activeCouponCount ?? 0)} href="/admin/coupons" />
      </div>

      {/* Sales card: full width, clickable */}
      <Link
        href="/admin/sales"
        className="mt-4 block rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10 hover:border-brand/30"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-neutral-300">
            <TrendingUp size={18} />
            <span className="text-sm font-semibold uppercase tracking-widest">Sales</span>
          </div>
          <span className="text-xs text-neutral-500 hover:text-brand">Details →</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SalesCell label="Today" value={fmtMoney(revenue.total.today)} />
          <SalesCell label="Last 7 days" value={fmtMoney(revenue.total.week)} />
          <SalesCell label="Month to date" value={fmtMoney(revenue.total.mtd)} />
          <SalesCell label="Year to date" value={fmtMoney(revenue.total.ytd)} />
        </div>
      </Link>

      {/* Nav */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { href: "/admin/bookings", icon: <Calendar size={16} />, label: "Manage Bookings" },
          { href: "/admin/bays", icon: <Clock size={16} />, label: "Bays & Block Times" },
          { href: "/admin/members", icon: <Users size={16} />, label: "Members" },
          { href: "/admin/users", icon: <UserCircle size={16} />, label: "Users" },
          { href: "/admin/coupons", icon: <Tag size={16} />, label: "Coupons" },
          { href: "/admin/gift-cards", icon: <Gift size={16} />, label: "Gift Cards" },
          { href: "/admin/hour-credits", icon: <Clock size={16} />, label: "Hour Credits" },
          { href: "/admin/phone", icon: <Phone size={16} />, label: "Phone Agent" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
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
                  const p = b.profiles as { first_name: string; last_name: string } | null
                  const bay = b.bays as { name: string } | null
                  return (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">{p ? `${p.first_name} ${p.last_name}` : "N/A"}</td>
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

function SalesCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 uppercase tracking-widest">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

