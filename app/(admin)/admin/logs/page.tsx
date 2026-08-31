import * as React from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Activity Log | Tee365" }
export const dynamic = "force-dynamic"

const FILTERS = [
  { key: "all", label: "All events" },
  { key: "communications", label: "Communications (sent emails/SMS)" },
  { key: "failures", label: "Failures only" },
  { key: "alerts", label: "Alerts (owner SMS)" },
  { key: "membership", label: "Membership" },
  { key: "booking", label: "Booking" },
  { key: "gift-card", label: "Gift card" },
  { key: "cron", label: "Cron / audit" },
]

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = "failures" } = await searchParams
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient
    .from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/account")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (serviceClient as any).from("admin_logs").select("event, detail, created_at").order("created_at", { ascending: false }).limit(200)
  if (filter === "failures") query = query.ilike("event", "%FAILED%")
  else if (filter === "communications") query = query.in("event", ["sms-sent", "email-sent"])
  else if (filter === "alerts") query = query.ilike("detail", "%ALERT%")
  else if (filter === "membership") query = query.ilike("event", "%membership%")
  else if (filter === "booking") query = query.ilike("event", "%booking%")
  else if (filter === "gift-card") query = query.ilike("event", "%gift%")
  else if (filter === "cron") query = query.ilike("event", "%cron%")

  const { data: logs } = await query
  const rows = (logs ?? []) as Array<{ event: string; detail: string; created_at: string }>

  // Communications gets its own cleaner view - "detail" is a machine-format
  // string (kind=X to=Y subject=Z) that's useless to read raw. Parsed once
  // here since only this filter's rows have that consistent shape (see
  // sendResendEmail/sendSmsMessage's own logEvent calls) - every other
  // filter mixes too many different detail formats to parse the same way,
  // so they keep the raw view below.
  let commRows: { when: string; what: string; to: string; subject: string | null; name: string | null }[] = []
  if (filter === "communications" && rows.length > 0) {
    const parsed = rows.map((r) => {
      const kind = r.detail.match(/kind=(\S+)/)?.[1] ?? "unknown"
      const to = r.detail.match(/to=(\S+)/)?.[1] ?? ""
      const subject = r.detail.match(/subject=(.+)$/)?.[1] ?? null
      return { r, kind, to, subject }
    })

    const { data: profiles } = await serviceClient.from("profiles").select("id, first_name, last_name, phone")
    const profileList = (profiles ?? []) as { id: string; first_name: string; last_name: string; phone: string | null }[]
    const nameById = new Map(profileList.map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
    const nameByPhone = new Map(profileList.filter((p) => p.phone).map((p) => [p.phone as string, nameById.get(p.id) ?? null]))

    const emailRecipients = parsed.filter((p) => p.to.includes("@"))
    let nameByEmail = new Map<string, string | null>()
    if (emailRecipients.length > 0) {
      // No direct "get user by email" admin call exists - same
      // listUsers()-and-match pattern already used elsewhere (bays'
      // startTestBooking, hour-credits' grantHoursByEmail) rather than one
      // lookup per row.
      const { data: usersPage } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      nameByEmail = new Map(
        (usersPage?.users ?? [])
          .filter((u) => u.email)
          .map((u) => [u.email!.toLowerCase(), nameById.get(u.id) ?? null])
      )
    }

    commRows = parsed.map(({ r, kind, to, subject }) => ({
      when: new Date(r.created_at).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        timeZone: "America/Indiana/Indianapolis",
      }),
      what: kind.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" "),
      to,
      subject,
      name: (to.includes("@") ? nameByEmail.get(to.toLowerCase()) : nameByPhone.get(to)) ?? null,
    }))
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Activity Log</h1>
          <p className="text-sm text-neutral-500 mt-1">Most recent 200 events</p>
        </div>
        <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">← Back to dashboard</Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <Link
            key={f.key}
            href={`/admin/logs?filter=${f.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.key
                ? "bg-brand text-black"
                : "bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 py-10 text-center">No events match this filter.</p>
      ) : filter === "communications" ? (
        <div className="overflow-hidden rounded-xl border border-white/10 divide-y divide-white/5">
          {commRows.map((row, i) => (
            <div key={i} className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <div className="text-xs text-neutral-500 sm:w-28 sm:shrink-0 whitespace-nowrap">{row.when}</div>
              <div className="text-xs font-medium text-neutral-200 sm:w-36 sm:shrink-0">{row.what}</div>
              <div className="text-xs text-neutral-300 sm:w-56 sm:shrink-0 break-all">
                {row.name ? (
                  <>
                    {row.name} <span className="text-neutral-600">({row.to})</span>
                  </>
                ) : (
                  row.to
                )}
              </div>
              <div className="text-xs text-neutral-500 sm:flex-1 break-words">{row.subject ?? "n/a"}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3 w-44">When (ET)</th>
                <th className="px-4 py-3 w-72">Event</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isFailure = /FAILED/i.test(row.event)
                const isAlert = /ALERT/i.test(row.detail) || row.event.startsWith("ALERT")
                const eventClass = isFailure
                  ? "text-red-400 font-semibold"
                  : isAlert
                    ? "text-yellow-300 font-semibold"
                    : "text-neutral-200"
                return (
                  <tr key={i} className="border-b border-white/5 align-top">
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        timeZone: "America/Indiana/Indianapolis",
                      })}
                    </td>
                    <td className={`px-4 py-3 font-mono text-xs ${eventClass}`}>{row.event}</td>
                    <td className="px-4 py-3 text-xs text-neutral-400 break-all">{renderDetail(row.detail)}</td>
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

function renderDetail(detail: string): React.ReactNode {
  // Split on UUIDs (8-4-4-4-12 hex). Wrap matches in Links to /admin/users/<id>.
  const uuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = uuidRe.exec(detail)) !== null) {
    if (m.index > last) parts.push(detail.slice(last, m.index))
    const uuid = m[1]
    parts.push(
      <a key={i++} href={`/admin/users/${uuid}`} className="text-brand hover:underline font-mono">{uuid}</a>
    )
    last = m.index + uuid.length
  }
  if (last < detail.length) parts.push(detail.slice(last))
  return parts.length > 0 ? parts : detail
}

