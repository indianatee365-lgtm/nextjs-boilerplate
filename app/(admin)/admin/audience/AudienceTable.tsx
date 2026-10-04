"use client"

import { useMemo, useState } from "react"
import {
  type AudienceMember,
  type AudienceSegment,
  inSegment,
  isMailable,
  SEGMENT_ORDER,
  SEGMENT_LABELS,
} from "@/lib/admin/audience-segments"
import { optOutEmail } from "./actions"

/** Rendering all 400 rows at once is fine; rendering 10,000 would not be. */
const PAGE_SIZE = 100

export default function AudienceTable({ audience }: { audience: AudienceMember[] }) {
  const [search, setSearch] = useState("")
  const [segment, setSegment] = useState<AudienceSegment>("all")
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return audience.filter((m) => {
      if (!inSegment(m, segment)) return false
      if (!q) return true
      const name = `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase()
      return m.email.includes(q) || name.includes(q)
    })
  }, [audience, search, segment])

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          timeZone: "America/Indiana/Indianapolis",
        })
      : "-"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_SIZE) }}
          placeholder="Search name or email"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-brand focus:outline-none"
        />
        <select
          value={segment}
          onChange={(e) => { setSegment(e.target.value as AudienceSegment); setLimit(PAGE_SIZE) }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none"
        >
          {SEGMENT_ORDER.map((s) => (
            <option key={s} value={s} className="bg-neutral-900">{SEGMENT_LABELS[s]}</option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">{filtered.length} shown</span>
      </div>

      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500 bg-white/[0.02]">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Bookings</th>
              <th className="px-4 py-3">Last visit</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="text-neutral-300">
            {filtered.slice(0, limit).map((m) => (
              <tr key={m.email} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">
                  {[m.firstName, m.lastName].filter(Boolean).join(" ") || <span className="text-neutral-600">no name</span>}
                </td>
                <td className="px-4 py-3 text-neutral-400">{m.displayEmail}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.isFounder && <Tag className="bg-brand/20 text-brand">Founder</Tag>}
                    {m.isMember && !m.isFounder && <Tag className="bg-blue-500/20 text-blue-300">{m.membershipPlan}</Tag>}
                    {!m.hasAccount && <Tag className="bg-white/10 text-neutral-400">Waitlist</Tag>}
                    {m.hasAccount && m.bookingCount === 0 && <Tag className="bg-yellow-500/15 text-yellow-400">Never booked</Tag>}
                    {m.optedOut && <Tag className="bg-red-500/20 text-red-300">Unsubscribed</Tag>}
                    {m.banned && <Tag className="bg-red-500/20 text-red-300">Banned</Tag>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{m.bookingCount}</td>
                <td className="px-4 py-3 text-neutral-400">{fmtDate(m.lastBookingAt)}</td>
                <td className="px-4 py-3 text-right">
                  {isMailable(m) && (
                    <form action={optOutEmail}>
                      <input type="hidden" name="email" value={m.email} />
                      <button
                        type="submit"
                        className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                        title="Stop sending marketing email to this address"
                      >
                        Unsubscribe
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
          className="mt-3 rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/5"
        >
          Show {Math.min(PAGE_SIZE, filtered.length - limit)} more
        </button>
      )}
    </div>
  )
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
}
