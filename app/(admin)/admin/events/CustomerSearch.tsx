"use client"

import { useEffect, useRef, useState } from "react"
import { searchCustomersAction, type CustomerHit } from "./actions"

const fmtPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? ""
}
const PLAN: Record<string, string> = { founder: "Founder", eagle: "Eagle", birdie: "Birdie", albatross: "Albatross" }

/** Type a name, phone or email; pick a customer to fill the form. */
export default function CustomerSearch({
  onPick,
  label = "Find an existing customer (name, phone or email)",
  emptyText = "No match. Fill in the fields below for a new customer.",
}: {
  onPick: (c: CustomerHit & { phoneFormatted: string }) => void
  label?: string
  emptyText?: string
}) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<CustomerHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  // Picking someone writes their name into the box, which would otherwise kick
  // off a fresh search that pops the list straight back open over the form.
  const justPicked = useRef(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    let live = true
    const t = setTimeout(() => {
      searchCustomersAction(q).then((r) => { if (live) { setHits(r); setActive(0); if (!justPicked.current) setOpen(true); justPicked.current = false } }).catch(() => { if (live) setHits([]) })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  function pick(c: CustomerHit) {
    onPick({ ...c, phoneFormatted: fmtPhone(c.phone) })
    justPicked.current = true
    setQ(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim())
    setOpen(false)
  }

  const shown = q.trim().length >= 2 ? hits : []
  return (
    <div ref={box} className="relative">
      <label htmlFor="cust-search" className="block text-xs font-medium text-neutral-400">{label}</label>
      <input id="cust-search" autoComplete="off" value={q} placeholder="e.g. valdez"
        onChange={(e) => { justPicked.current = false; setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !shown.length) return
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)) }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === "Enter") { e.preventDefault(); pick(shown[active]) }
          if (e.key === "Escape") setOpen(false)
        }}
        className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/15 bg-neutral-900 shadow-xl">
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-500">{emptyText}</p>
          ) : shown.map((c, i) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}
              className={`block w-full px-3 py-2 text-left text-sm ${i === active ? "bg-white/10" : "hover:bg-white/5"}`}>
              <span className="font-medium text-white">{c.first_name} {c.last_name}</span>
              {c.plan && <span className="ml-2 rounded bg-[#00A651]/20 px-1.5 text-[10px] text-[#00A651]">{PLAN[c.plan] ?? c.plan}</span>}
              {c.banned && <span className="ml-2 rounded bg-red-500/20 px-1.5 text-[10px] text-red-300">Banned</span>}
              <span className="block text-xs text-neutral-400">
                {[fmtPhone(c.phone), c.email, c.last_booking ? `last visit ${new Date(c.last_booking).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "no visits yet"].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
