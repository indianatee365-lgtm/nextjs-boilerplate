"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

export type UserRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string | null
  created_at: string
  bookingCount: number
  firstBookedAt: string | null
  newThisMonth: boolean
  joinedAndBookedSameDay: boolean
}

type Segment =
  | "all"
  | "new_this_month"
  | "no_phone"
  | "never_booked"
  | "single_booking"
  | "same_day"
  | "repeat"

const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: "new_this_month", label: "New this month", hint: "Accounts created this calendar month" },
  { key: "no_phone", label: "No phone number", hint: "Cannot be reached by SMS at all" },
  { key: "never_booked", label: "Never booked", hint: "Made an account and never completed a booking" },
  { key: "single_booking", label: "Single booking", hint: "Came once and has not been back" },
  { key: "same_day", label: "Joined and booked same day", hint: "Signed up and booked on the same day, most likely only to book" },
  { key: "repeat", label: "Multiple bookings", hint: "Booked more than once" },
]

function matches(u: UserRow, segment: Segment): boolean {
  switch (segment) {
    case "all": return true
    case "new_this_month": return u.newThisMonth
    case "no_phone": return !u.phone || u.phone.trim() === ""
    case "never_booked": return u.bookingCount === 0
    case "single_booking": return u.bookingCount === 1
    case "same_day": return u.joinedAndBookedSameDay
    case "repeat": return u.bookingCount > 1
  }
}

type SortKey = "name" | "phone" | "bookings" | "created_at"
type SortDir = "asc" | "desc"

function normalize(v: string | null) {
  return (v ?? "").toLowerCase()
}

function SortHeader({
  label, sortKeyValue, sortKey, sortDir, onSort, className = "",
}: {
  label: string
  sortKeyValue: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sortKey === sortKeyValue
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        className={`flex items-center gap-1 hover:text-neutral-300 transition-colors ${active ? "text-neutral-200" : ""}`}
      >
        {label}
        {active ? <span className="text-brand">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  )
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  })

export default function UsersTable({ rows }: { rows: UserRow[] }) {
  const [query, setQuery] = useState("")
  const [segment, setSegment] = useState<Segment>("all")
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "created_at" || key === "bookings" ? "desc" : "asc")
    }
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: rows.length }
    for (const s of SEGMENTS) out[s.key] = rows.filter((u) => matches(u, s.key)).length
    return out
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = rows.filter((u) => {
      if (!matches(u, segment)) return false
      if (!q) return true
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase()
      return name.includes(q) || normalize(u.phone).includes(q)
    })

    return [...base].sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") {
        cmp = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim().toLowerCase()
          .localeCompare(`${b.first_name ?? ""} ${b.last_name ?? ""}`.trim().toLowerCase())
      } else if (sortKey === "phone") {
        cmp = normalize(a.phone).localeCompare(normalize(b.phone))
      } else if (sortKey === "bookings") {
        cmp = a.bookingCount - b.bookingCount
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [rows, query, segment, sortKey, sortDir])

  const activeLabel = SEGMENTS.find((s) => s.key === segment)?.label

  return (
    <div>
      {/* Click a card to filter the list below, click it again to clear. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SEGMENTS.map((s) => {
          const active = segment === s.key
          return (
            <button
              key={s.key}
              type="button"
              title={s.hint}
              onClick={() => setSegment(active ? "all" : s.key)}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? "border-brand bg-brand/10"
                  : "border-white/10 bg-white/5 hover:border-brand/40 hover:bg-brand/5"
              }`}
            >
              <p className={`text-2xl font-bold ${active ? "text-brand" : "text-white"}`}>{counts[s.key]}</p>
              <p className="mt-1 text-xs leading-snug text-neutral-400">{s.label}</p>
            </button>
          )
        })}
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone…"
          className="input w-full max-w-sm"
        />
        {segment !== "all" && (
          <button
            type="button"
            onClick={() => setSegment("all")}
            className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/20"
          >
            {activeLabel} &middot; clear filter
          </button>
        )}
        <span className="text-xs text-neutral-500">
          {filtered.length} of {rows.length} shown
        </span>
      </div>

      {filtered.length > 0 ? (
        <>
        {/* Phone: a table this wide cannot fit a portrait screen, and the
            rounded wrapper's overflow-hidden silently CLIPPED the overflow
            rather than letting it scroll, so the right-hand columns were
            simply unreachable without turning the phone sideways. Cards
            instead - the same information, stacked, each one tappable. */}
        <div className="space-y-2 md:hidden">
          {filtered.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-brand/40 hover:bg-brand/5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-white">{u.first_name} {u.last_name}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  u.role === "admin" ? "bg-brand/20 text-brand" : "bg-white/10 text-neutral-400"
                }`}>{u.role ?? "user"}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-300">{u.phone ?? "No phone"}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Joined {fmtDate(u.created_at)} &middot; {u.bookingCount} booking{u.bookingCount === 1 ? "" : "s"}
                {u.joinedAndBookedSameDay && " · booked same day"}
              </p>
            </Link>
          ))}
        </div>

        <div className="hidden rounded-xl border border-white/10 md:block">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <SortHeader label="Name" sortKeyValue="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Phone" sortKeyValue="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Bookings" sortKeyValue="bookings" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Joined" sortKeyValue="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="block hover:text-brand">
                      {u.first_name} {u.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className={`block ${u.phone ? "" : "text-neutral-600"}`}>
                      {u.phone ?? "No phone"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="block">
                      {u.bookingCount}
                      {u.joinedAndBookedSameDay && (
                        <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">same day</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    <Link href={`/admin/users/${u.id}`} className="block">{fmtDate(u.created_at)}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="block">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === "admin" ? "bg-brand/20 text-brand" : "bg-white/10 text-neutral-400"
                      }`}>{u.role ?? "user"}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          {query || segment !== "all" ? "No users match this filter." : "No users yet."}
        </p>
      )}
    </div>
  )
}
