import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "User detail | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: meProfile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((meProfile as { role: string } | null)?.role !== "admin") redirect("/account")

  const [{ data: target }, { data: authUserRes }] = await Promise.all([
    serviceClient.from("profiles").select("id, first_name, last_name, phone, role, sms_consent, stripe_customer_id, created_at").eq("id", id).single(),
    serviceClient.auth.admin.getUserById(id),
  ])
  if (!target) notFound()
  const t = target as { id: string; first_name: string; last_name: string; phone: string | null; role: string | null; sms_consent: boolean | null; stripe_customer_id: string | null; created_at: string }
  const targetEmail = authUserRes?.user?.email ?? "N/A"

  const [{ data: memberships }, { data: bookings }, { data: giftCards }, { data: logs }] = await Promise.all([
    serviceClient.from("memberships").select("id, status, plan_type, started_at, current_period_end, cancelled_at, cancellation_requested_at, founder_number, stripe_customer_id, stripe_subscription_id, membership_plans(name, display_name)").eq("user_id", id).order("started_at", { ascending: false }),
    serviceClient.from("bookings").select("id, starts_at, ends_at, status, total, access_code, bays(name)").eq("user_id", id).order("starts_at", { ascending: false }).limit(10),
    serviceClient.from("gift_cards").select("code, original_amount, balance, recipient_name, recipient_email, created_at").eq("purchased_by", `${t.first_name} ${t.last_name}`).order("created_at", { ascending: false }).limit(5),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("admin_logs").select("event, detail, created_at").ilike("detail", `%${id}%`).order("created_at", { ascending: false }).limit(20),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/users" className="text-xs text-neutral-400 hover:text-white">← Back to users</Link>

      <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t.first_name} {t.last_name}</h1>
          <p className="text-sm text-neutral-500 mt-1">User ID: <span className="font-mono text-xs">{t.id}</span></p>
        </div>
        <Link
          href={`/admin/users/${id}/dashboard`}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-black hover:brightness-95 shadow-lg whitespace-nowrap"
          style={{ backgroundColor: "var(--brand)" }}
        >
          View as customer →
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Field label="Email" value={targetEmail} />
        <Field label="Phone" value={t.phone ?? "N/A"} />
        <Field label="Role" value={t.role ?? "user"} />
        <Field label="Joined" value={new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
        <Field label="SMS consent" value={t.sms_consent ? "Yes" : "No"} />
        <Field label="Stripe customer" value={t.stripe_customer_id ?? "N/A"} />
      </div>

      {/* Memberships */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Memberships</h2>
        {memberships && memberships.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="px-4 py-2">Plan</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Started</th><th className="px-4 py-2">Period end</th><th className="px-4 py-2">Founder #</th><th className="px-4 py-2">Subscription</th>
              </tr></thead>
              <tbody>
                {memberships.map((m) => {
                  const plan = m.membership_plans as { name: string; display_name: string | null } | null
                  return (
                    <tr key={m.id} className="border-t border-white/5 text-neutral-300">
                      <td className="px-4 py-2">{plan?.display_name ?? plan?.name ?? m.plan_type}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.status === "active" ? "bg-green-500/20 text-green-400" :
                          m.status === "past_due" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>{m.status}{m.cancellation_requested_at ? " · cancel pending" : ""}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{new Date(m.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{m.current_period_end ? new Date(m.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}</td>
                      <td className="px-4 py-2 text-xs text-brand font-semibold">{m.founder_number ? `#${m.founder_number}` : "N/A"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-500 break-all">{m.stripe_subscription_id ?? "N/A"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No memberships.</p>}
      </section>

      {/* Recent bookings */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Recent bookings</h2>
        {bookings && bookings.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="px-4 py-2">When</th><th className="px-4 py-2">Bay</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Total</th><th className="px-4 py-2">Code</th>
              </tr></thead>
              <tbody>
                {bookings.map((b) => {
                  const bay = b.bays as { name: string } | null
                  return (
                    <tr key={b.id} className="border-t border-white/5 text-neutral-300">
                      <td className="px-4 py-2 text-xs">{new Date(b.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className="px-4 py-2 text-xs">{bay?.name ?? "N/A"}</td>
                      <td className="px-4 py-2 text-xs">{b.status}</td>
                      <td className="px-4 py-2 text-xs">${Number(b.total).toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-400">{b.access_code ?? "N/A"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No bookings.</p>}
      </section>

      {/* Gift cards */}
      {giftCards && giftCards.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Gift cards purchased</h2>
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="px-4 py-2">Code</th><th className="px-4 py-2">Recipient</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Balance</th><th className="px-4 py-2">When</th>
              </tr></thead>
              <tbody>
                {giftCards.map((g) => (
                  <tr key={g.code} className="border-t border-white/5 text-neutral-300">
                    <td className="px-4 py-2 font-mono text-xs">{g.code}</td>
                    <td className="px-4 py-2 text-xs">{g.recipient_name} ({g.recipient_email})</td>
                    <td className="px-4 py-2 text-xs">${Number(g.original_amount).toFixed(2)}</td>
                    <td className="px-4 py-2 text-xs">${Number(g.balance).toFixed(2)}</td>
                    <td className="px-4 py-2 text-xs text-neutral-400">{new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent events */}
      <section className="mt-8 mb-12">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Recent events</h2>
        {logs && logs.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {(logs as Array<{ event: string; detail: string; created_at: string }>).map((row, i) => {
                  const isFailure = /FAILED/i.test(row.event)
                  return (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-4 py-2 text-xs text-neutral-500 w-32 whitespace-nowrap">{new Date(row.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className={`px-4 py-2 font-mono text-xs ${isFailure ? "text-red-400 font-semibold" : "text-neutral-200"}`}>{row.event}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400 break-all">{row.detail}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No events for this user.</p>}
      </section>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm text-neutral-200 mt-0.5 break-all">{value}</p>
    </div>
  )
}
