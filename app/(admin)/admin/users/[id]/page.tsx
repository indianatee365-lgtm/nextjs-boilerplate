import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import SendPastDueNudgeButton from "./SendPastDueNudgeButton"
import ReinstateMembershipButton from "./ReinstateMembershipButton"
import SendCancelledNoticeButton from "./SendCancelledNoticeButton"
import ReinstateBlockToggle from "./ReinstateBlockToggle"
import BanCustomerPanel from "./BanCustomerPanel"
import VeteranToggle from "./VeteranToggle"
import DeleteAccountPanel from "./DeleteAccountPanel"
import { VETERAN_DISCOUNT_PERCENT } from "@/lib/pricing/engine"
import { computeUserValue, type ValueBuckets } from "@/lib/admin/userValue"

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
    serviceClient.from("profiles").select("id, first_name, last_name, phone, role, sms_consent, stripe_customer_id, created_at, reinstate_blocked, reinstate_blocked_reason, banned, banned_at, banned_reason, veteran_verified_at, veteran_verification_source, deleted_at").eq("id", id).single(),
    serviceClient.auth.admin.getUserById(id),
  ])
  if (!target) notFound()
  const t = target as { id: string; first_name: string; last_name: string; phone: string | null; role: string | null; sms_consent: boolean | null; stripe_customer_id: string | null; created_at: string; reinstate_blocked: boolean | null; reinstate_blocked_reason: string | null; banned: boolean | null; banned_at: string | null; banned_reason: string | null; veteran_verified_at: string | null; veteran_verification_source: string | null; deleted_at: string | null }
  const targetEmail = authUserRes?.user?.email ?? "N/A"
  const value = await computeUserValue(serviceClient, id, `${t.first_name} ${t.last_name}`, t.stripe_customer_id)

  const [{ data: memberships }, { data: bookings }, { data: giftCards }, { data: logs }] = await Promise.all([
    serviceClient.from("memberships").select("id, status, plan_type, started_at, current_period_end, cancelled_at, cancellation_requested_at, founder_number, stripe_customer_id, stripe_subscription_id, membership_plans(name, display_name)").eq("user_id", id).order("started_at", { ascending: false }),
    serviceClient.from("bookings").select("id, starts_at, ends_at, status, total, access_code, credit_hours_applied, grounds_crew_minutes, extension_minutes, extension_count, extension_revenue, bays(name)").eq("user_id", id).order("starts_at", { ascending: false }).limit(10),
    serviceClient.from("gift_cards").select("code, original_amount, balance, recipient_name, recipient_email, created_at").eq("purchased_by", `${t.first_name} ${t.last_name}`).order("created_at", { ascending: false }).limit(5),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("admin_logs").select("event, detail, created_at").ilike("detail", `%${id}%`).order("created_at", { ascending: false }).limit(20),
  ])

  // Free hours: every credit this person holds, why they got it, and what used
  // it. Added 2026-10-18 because a free-hour booking meant opening the Hour
  // Credits page and hunting for the name to find out where the time came from.
  const [{ data: creditRows }, { data: useRows }] = await Promise.all([
    serviceClient.from("hour_credits")
      .select("id, code, hours, hours_remaining, reason, expires_at, active, created_at, redeemed_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    serviceClient.from("hour_credit_uses")
      .select("booking_id, hour_credit_id, hours_used, created_at, bookings(starts_at, status, bays(name))")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
  ])
  type CreditRow = { id: string; code: string | null; hours: number; hours_remaining: number; reason: string | null; expires_at: string | null; active: boolean; created_at: string; redeemed_at: string | null }
  type UseRow = { booking_id: string; hour_credit_id: string; hours_used: number; created_at: string; bookings: { starts_at: string; status: string; bays: { name: string } | null } | null }
  const credits = (creditRows ?? []) as CreditRow[]
  const uses = (useRows ?? []) as unknown as UseRow[]
  const nowMs = new Date().getTime()
  const creditStatus = (c: CreditRow) =>
    !c.active ? "deactivated"
    : c.expires_at && new Date(c.expires_at).getTime() < nowMs ? "expired"
    : Number(c.hours_remaining) <= 0 ? "used up"
    : "available"
  const creditLabel = (c: CreditRow | undefined) =>
    !c ? "unknown credit" : c.reason?.trim() || (c.code ? `code ${c.code}` : "direct grant, no reason given")
  const creditById = new Map(credits.map((c) => [c.id, c]))
  const usesByCredit = new Map<string, UseRow[]>()
  const usesByBooking = new Map<string, UseRow[]>()
  for (const u of uses) {
    usesByCredit.set(u.hour_credit_id, [...(usesByCredit.get(u.hour_credit_id) ?? []), u])
    usesByBooking.set(u.booking_id, [...(usesByBooking.get(u.booking_id) ?? []), u])
  }
  const availableHours = credits.filter((c) => creditStatus(c) === "available").reduce((sum, c) => sum + Number(c.hours_remaining), 0)
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/users" className="text-xs text-neutral-400 hover:text-white">← Back to users</Link>

      <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold text-white">{t.first_name} {t.last_name}</h1>
            {t.banned && (
              <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-red-300">
                Banned
              </span>
            )}
          </div>
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
        <Field label="Joined" value={new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })} />
        <Field label="SMS consent" value={t.sms_consent ? "Yes" : "No"} />
        <Field label="Stripe customer" value={t.stripe_customer_id ?? "N/A"} />
      </div>


      {/* Customer value: what this person has paid us and what we have given
          them, so one glance answers "is this customer making or costing us
          money". Same cash rules as /admin/sales. Added 2026-10-21. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Customer value</h2>
        {value.hasData ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="py-1.5 pr-4"></th>
                <th className="py-1.5 px-3 text-right">Month to date</th>
                <th className="py-1.5 px-3 text-right">Year to date</th>
                <th className="py-1.5 pl-3 text-right">All time</th>
              </tr></thead>
              <tbody>
                <ValueRow label="Bay time" b={value.cashIn.bookings} />
                <ValueRow label="Bay extensions" b={value.cashIn.extensions} />
                <ValueRow label="Membership fees (monthly)" b={value.cashIn.renewals} />
                <ValueRow label="Membership sign-up" b={value.cashIn.memberships} />
                <ValueRow label="Gift cards bought" b={value.cashIn.giftCards} />
                <ValueRow label="Cash in" b={value.cashIn.total} strong tone="good" />
                <ValueRow label="Membership discount" b={value.givenAway.membership} />
                <ValueRow label="Coupons" b={value.givenAway.coupons} />
                <ValueRow label="Site-wide sales" b={value.givenAway.sales} />
                <ValueRow label="Veteran discount" b={value.givenAway.veteran} />
                <ValueRow label="Free hours" b={value.givenAway.freeHours} />
                <ValueRow label="Grounds Crew minutes" b={value.givenAway.groundsCrew} />
                <ValueRow label="Free membership (sign-up waived)" b={value.givenAway.freeMembership} />
                <ValueRow label="Given away" b={value.givenAway.total} strong tone="bad" />
                <ValueRow label="Paid with a gift card" b={value.giftCardRedeemed} muted />
                <ValueRow label="Refunded" b={value.refunded} muted />
              </tbody>
            </table>
            <p className="mt-3 text-xs text-neutral-500">
              Cash in is money actually collected, after refunds and gift cards. Given away is the list-price value of discounts and free time on bookings that were not cancelled. Gift card payments are shown separately because that money was already counted when the card was sold.
            </p>
          </div>
        ) : <p className="text-sm text-neutral-500">No money in or out for this customer yet.</p>}
      </section>

      {/* Memberships */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Memberships</h2>
        {memberships?.some((m) => m.status === "past_due") && (
          <SendPastDueNudgeButton userId={t.id} />
        )}
        {(() => {
          // Offer reinstatement only when there is something lapsed to restore
          // and nothing live to conflict with it. Mirrors the same guard
          // reinstateMembership() enforces server-side.
          const live = memberships?.find((m) => m.status === "active" || m.status === "past_due")
          if (live) return null
          const lapsed = memberships?.find((m) => m.status === "cancelled")
          if (!lapsed) return null
          const lapsedPlan = lapsed.membership_plans as { name: string; display_name: string | null } | null
          return (
            <>
              <ReinstateMembershipButton
                userId={t.id}
                planLabel={lapsedPlan?.display_name ?? lapsedPlan?.name ?? lapsed.plan_type}
                founderNumber={lapsed.founder_number}
              />
              <SendCancelledNoticeButton userId={t.id} />
            </>
          )
        })()}
        {memberships && memberships.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-x-auto">
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
                      <td className="px-4 py-2 text-xs text-neutral-400">{new Date(m.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{m.current_period_end ? new Date(m.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" }) : "N/A"}</td>
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

      {/* Free hours */}
      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider text-xs">Free hours</h2>
          {credits.length > 0 && (
            <span className="text-xs text-neutral-400">
              <span className="font-semibold text-white">{availableHours}h</span> available now
            </span>
          )}
        </div>
        {credits.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="px-4 py-2">Why</th><th className="px-4 py-2">Left</th><th className="px-4 py-2">Granted</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Used on</th>
              </tr></thead>
              <tbody>
                {credits.map((c) => {
                  const st = creditStatus(c)
                  const used = usesByCredit.get(c.id) ?? []
                  return (
                    <tr key={c.id} className="border-t border-white/5 text-neutral-300 align-top">
                      <td className="px-4 py-2 text-xs text-white">
                        {creditLabel(c)}
                        {c.code && c.reason && <span className="block font-mono text-[10px] text-neutral-500">code {c.code}</span>}
                      </td>
                      <td className="px-4 py-2 text-xs whitespace-nowrap">{Number(c.hours_remaining)} / {Number(c.hours)}h</td>
                      <td className="px-4 py-2 text-xs text-neutral-400 whitespace-nowrap">{fmtDate(c.redeemed_at ?? c.created_at)}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400 whitespace-nowrap">{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
                      <td className="px-4 py-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${
                          st === "available" ? "bg-green-500/20 text-green-400" :
                          st === "used up" ? "bg-white/10 text-neutral-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>{st}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-400">
                        {used.length === 0 ? "Not used yet" : used.map((u) => (
                          <span key={u.booking_id + u.created_at} className="block whitespace-nowrap">
                            {/* A negative use is the hours going back when a booking is cancelled. */}
                            {Number(u.hours_used) < 0 ? `${-Number(u.hours_used)}h returned` : `${Number(u.hours_used)}h`} · {u.bookings ? `${fmtWhen(u.bookings.starts_at)}, ${u.bookings.bays?.name ?? "bay ?"}` : "booking removed"}
                            {u.bookings?.status === "cancelled" ? " (cancelled)" : ""}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-500">No free hours on this account.</p>}
      </section>

      {/* Account controls. Deliberately their own section: a ban and a veteran
          discount are not membership operations, and burying them under that
          heading as a row of underlined text made three separate actions read
          as one link. One per row, severity shown by colour. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Account controls</h2>
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-white/10 p-4">
          <VeteranToggle
            userId={t.id}
            verifiedAt={t.veteran_verified_at}
            source={t.veteran_verification_source}
            discountPercent={VETERAN_DISCOUNT_PERCENT}
          />
          {/* A ban already blocks the self-service restore, so offering the
              narrower toggle alongside it would just be a second switch for
              something already off. */}
          {!t.banned && (
            <ReinstateBlockToggle
              userId={t.id}
              blocked={t.reinstate_blocked === true}
              reason={t.reinstate_blocked_reason}
            />
          )}
          <BanCustomerPanel
            userId={t.id}
            name={`${t.first_name} ${t.last_name}`}
            banned={t.banned === true}
            reason={t.banned_reason}
            bannedAt={t.banned_at}
          />
          <DeleteAccountPanel
            userId={t.id}
            name={`${t.first_name} ${t.last_name}`}
            deletedAt={t.deleted_at}
          />
        </div>
      </section>

      {/* Recent bookings */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider text-xs">Recent bookings</h2>
        {bookings && bookings.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500"><tr>
                <th className="px-4 py-2">When</th><th className="px-4 py-2">Bay</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Total</th><th className="px-4 py-2">Extension</th><th className="px-4 py-2">Free time</th><th className="px-4 py-2">Code</th>
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
                      <td className="px-4 py-2 text-xs whitespace-nowrap">
                        {Number(b.extension_minutes ?? 0) > 0 ? (
                          <>
                            +{Number(b.extension_minutes)} min
                            <span className="block text-neutral-500">
                              {Number(b.extension_revenue ?? 0) > 0 ? `$${Number(b.extension_revenue).toFixed(2)}` : "no charge"}
                              {Number(b.extension_count ?? 0) > 1 ? ` · ${Number(b.extension_count)} times` : ""}
                            </span>
                          </>
                        ) : <span className="text-neutral-600">none</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-300">
                        {(() => {
                          const parts: string[] = []
                          for (const u of usesByBooking.get(b.id) ?? []) {
                            const h = Number(u.hours_used)
                            parts.push(`${h < 0 ? `${-h}h returned` : `${h}h`}: ${creditLabel(creditById.get(u.hour_credit_id))}`)
                          }
                          if (parts.length === 0 && Number(b.credit_hours_applied ?? 0) > 0) parts.push(`${Number(b.credit_hours_applied)}h free hours`)
                          if (Number(b.grounds_crew_minutes ?? 0) > 0) parts.push(`${Number(b.grounds_crew_minutes)} min Grounds Crew (membership)`)
                          return parts.length ? parts.map((p) => <span key={p} className="block">{p}</span>) : <span className="text-neutral-600">none</span>
                        })()}
                      </td>
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
          <div className="rounded-xl border border-white/10 overflow-x-auto">
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
                    <td className="px-4 py-2 text-xs text-neutral-400">{new Date(g.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}</td>
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
          <div className="rounded-xl border border-white/10 overflow-x-auto">
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

function ValueRow({ label, b, strong, tone, muted }: { label: string; b: ValueBuckets; strong?: boolean; tone?: "good" | "bad"; muted?: boolean }) {
  // Lines with nothing in them ever are hidden so a casual customer's card is
  // three rows, not sixteen zeros. Totals always show.
  if (!strong && b.lifetime === 0) return null
  const money = (n: number) => `$${n.toFixed(2)}`
  const color = tone === "good" ? "text-green-400" : tone === "bad" ? "text-red-400" : muted ? "text-neutral-500" : "text-neutral-300"
  return (
    <tr className={strong ? "border-t border-white/10" : ""}>
      <td className={`py-1.5 pr-4 text-xs ${strong ? "font-semibold text-white" : muted ? "text-neutral-500" : "text-neutral-400"}`}>{label}</td>
      <td className={`py-1.5 px-3 text-right text-xs tabular-nums ${color} ${strong ? "font-semibold" : ""}`}>{money(b.mtd)}</td>
      <td className={`py-1.5 px-3 text-right text-xs tabular-nums ${color} ${strong ? "font-semibold" : ""}`}>{money(b.ytd)}</td>
      <td className={`py-1.5 pl-3 text-right text-xs tabular-nums ${color} ${strong ? "font-semibold" : ""}`}>{money(b.lifetime)}</td>
    </tr>
  )
}
