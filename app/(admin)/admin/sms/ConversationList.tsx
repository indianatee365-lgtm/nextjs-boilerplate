"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search } from "lucide-react"

export interface ConversationSummary {
  phone: string
  name: string | null
  preview: string
  at: string
  unread: number
}

const TZ = "America/Indiana/Indianapolis"

function shortTime(iso: string): string {
  const d = new Date(iso)
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ })
  if (key(d) === key(new Date())) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
  }
  if (Date.now() - d.getTime() < 6 * 86_400_000) {
    return d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
}

// The inbox list with a search box (name, number or message text), so finding
// one person no longer means scrolling past every contact.
export default function ConversationList({
  conversations,
  selectedPhone,
}: {
  conversations: ConversationSummary[]
  selectedPhone: string | null
}) {
  const [query, setQuery] = useState("")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const unreadCount = conversations.filter((c) => c.unread > 0).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, "")
    return conversations.filter((c) => {
      if (unreadOnly && c.unread === 0) return false
      if (!q) return true
      return (
        (c.name ?? "").toLowerCase().includes(q)
        || c.preview.toLowerCase().includes(q)
        || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))
      )
    })
  }, [conversations, query, unreadOnly])

  return (
    <>
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number or text"
            className="input w-full pl-9 text-base md:text-sm"
          />
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setUnreadOnly(false)}
            className={`rounded-full px-3 py-1 ${!unreadOnly ? "bg-white/15 text-white" : "bg-white/5 text-neutral-400"}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setUnreadOnly(true)}
            className={`rounded-full px-3 py-1 ${unreadOnly ? "bg-white/15 text-white" : "bg-white/5 text-neutral-400"}`}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
        {shown.length === 0 && (
          <p className="p-4 text-sm text-neutral-500">
            {conversations.length === 0 ? "No messages yet." : "No conversations match."}
          </p>
        )}
        {shown.map((c) => (
          <Link
            key={c.phone}
            href={`/admin/sms?phone=${encodeURIComponent(c.phone)}`}
            className={`block px-4 py-3 transition-colors hover:bg-white/5 ${selectedPhone === c.phone ? "bg-white/10" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className={`min-w-0 flex-1 truncate text-sm ${c.unread > 0 ? "font-semibold text-white" : "font-medium text-neutral-200"}`}>
                {c.name ?? c.phone}
              </span>
              <span className={`shrink-0 text-[11px] ${c.unread > 0 ? "text-[#00A651]" : "text-neutral-500"}`}>{shortTime(c.at)}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className={`min-w-0 flex-1 truncate text-xs ${c.unread > 0 ? "text-neutral-300" : "text-neutral-500"}`}>{c.preview}</p>
              {c.unread > 0 && (
                <span className="shrink-0 rounded-full bg-[#00A651] px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
