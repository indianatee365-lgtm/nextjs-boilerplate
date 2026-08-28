"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

type Profile = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: string | null
  created_at: string
}

type SortKey = "name" | "phone" | "role" | "created_at"
type SortDir = "asc" | "desc"

function normalize(v: string | null) {
  return (v ?? "").toLowerCase()
}

function SortHeader({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  sortKeyValue: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === sortKeyValue
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        className={`flex items-center gap-1 hover:text-neutral-300 transition-colors ${
          active ? "text-neutral-200" : ""
        }`}
      >
        {label}
        {active ? <span className="text-brand">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  )
}

export default function UsersTable({ profiles }: { profiles: Profile[] }) {
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "created_at" ? "desc" : "asc")
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? profiles.filter((p) => {
          const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase()
          const phone = normalize(p.phone)
          return name.includes(q) || phone.includes(q)
        })
      : profiles

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") {
        const nameA = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim().toLowerCase()
        const nameB = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim().toLowerCase()
        cmp = nameA.localeCompare(nameB)
      } else if (sortKey === "phone") {
        cmp = normalize(a.phone).localeCompare(normalize(b.phone))
      } else if (sortKey === "role") {
        cmp = normalize(a.role).localeCompare(normalize(b.role))
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [profiles, query, sortKey, sortDir])

  return (
    <div>
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone…"
          className="input w-full max-w-sm"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <SortHeader label="Name" sortKeyValue="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Phone" sortKeyValue="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Role" sortKeyValue="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Joined" sortKeyValue="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3"><Link href={`/admin/users/${p.id}`} className="block hover:text-brand">{p.first_name} {p.last_name}</Link></td>
                  <td className="px-4 py-3"><Link href={`/admin/users/${p.id}`} className="block">{p.phone ?? "N/A"}</Link></td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.id}`} className="block">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.role === "admin" ? "bg-brand/20 text-brand" : "bg-white/10 text-neutral-400"
                      }`}>{p.role ?? "user"}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400"><Link href={`/admin/users/${p.id}`} className="block">{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">{query ? "No users match your search." : "No users yet."}</p>
      )}
    </div>
  )
}
