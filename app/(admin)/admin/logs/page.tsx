import * as React from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Activity Log | Tee365" }
export const dynamic = "force-dynamic"

const FILTERS = [
  { key: "all", label: "All events" },
  { key: "failures", label: "Failures only" },
  { key: "alerts", label: "Alerts (sent SMS)" },
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
  else if (filter === "alerts") query = query.ilike("detail", "%ALERT%")
  else if (filter === "membership") query = query.ilike("event", "%membership%")
  else if (filter === "booking") query = query.ilike("event", "%booking%")
  else if (filter === "gift-card") query = query.ilike("event", "%gift%")
  else if (filter === "cron") query = query.ilike("event", "%cron%")

  const { data: logs } = await query
  const rows = (logs ?? []) as Array<{ event: string; detail: string; created_at: string }>

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
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
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

