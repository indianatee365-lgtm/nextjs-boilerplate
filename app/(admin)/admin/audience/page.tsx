import Link from "next/link"
import { requireAdmin } from "@/lib/admin/guard"
import {
  getAudience,
  segmentCounts,
  isMailable,
  SEGMENT_ORDER,
  SEGMENT_LABELS,
  SEGMENT_DESCRIPTIONS,
} from "@/lib/admin/audience"
import AudienceTable from "./AudienceTable"

export const metadata = { title: "Audience | Tee365 Admin" }
export const dynamic = "force-dynamic"

type CampaignRow = {
  id: string
  name: string
  segment: string
  subject: string
  status: string
  sent_at: string | null
  recipient_count: number | null
  sent_count: number
  failed_count: number
}

export default async function AudiencePage() {
  const { serviceClient } = await requireAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  const [audience, { data: campaignRows }] = await Promise.all([
    getAudience(),
    db.from("email_campaigns").select("*").order("created_at", { ascending: false }).limit(20),
  ])

  const counts = segmentCounts(audience)
  const campaigns = (campaignRows ?? []) as CampaignRow[]
  const suppressed = audience.filter((m) => !isMailable(m)).length

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          timeZone: "America/Indiana/Indianapolis",
        })
      : "-"

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Audience</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {audience.length} people, {audience.length - suppressed} mailable
            {suppressed > 0 && `, ${suppressed} unsubscribed or blocked`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/audience/new"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            New campaign
          </Link>
          <Link href="/admin" className="text-xs text-neutral-400 hover:text-white">&larr; Back to dashboard</Link>
        </div>
      </div>

      {/* Segment counts. Every number here is mailable people only, so what it
          says is what a campaign to that segment would actually reach. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
        {SEGMENT_ORDER.map((segment) => (
          <div
            key={segment}
            className="rounded-xl border border-white/10 bg-white/5 p-4"
            title={SEGMENT_DESCRIPTIONS[segment]}
          >
            <p className="text-xs uppercase tracking-widest text-neutral-500">{SEGMENT_LABELS[segment]}</p>
            <p className="mt-1 text-2xl font-bold text-white">{counts[segment]}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">People</h2>
      <AudienceTable audience={audience} />

      <h2 className="text-lg font-semibold text-white mt-10 mb-3">Campaigns</h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing sent yet.</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3 text-right">Delivered</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-white">{c.name}</td>
                  <td className="px-4 py-3">{SEGMENT_LABELS[c.segment as keyof typeof SEGMENT_LABELS] ?? c.segment}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.subject}</td>
                  <td className="px-4 py-3 text-neutral-400">{fmtDate(c.sent_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.sent_count}
                    {c.failed_count > 0 && (
                      <span className="text-red-400"> ({c.failed_count} failed)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
