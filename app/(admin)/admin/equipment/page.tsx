import Link from "next/link"
import { requireAdmin } from "@/lib/admin/guard"
import { addEquipment, setEquipmentStatus } from "./actions"

export const metadata = { title: "Equipment | Tee365 Admin" }

const STATUS_STYLE: Record<string, string> = {
  in_service: "bg-green-500/20 text-green-400",
  damaged: "bg-amber-500/20 text-amber-400",
  retired: "bg-neutral-500/20 text-neutral-400",
  missing: "bg-red-500/20 text-red-400",
}

const STATUS_LABEL: Record<string, string> = {
  in_service: "In service",
  damaged: "Damaged",
  retired: "Retired",
  missing: "Missing",
}

const NEXT_STATUS: Record<string, { to: string; label: string }> = {
  in_service: { to: "damaged", label: "Mark damaged" },
  damaged: { to: "retired", label: "Retire" },
  retired: { to: "in_service", label: "Return to service" },
  missing: { to: "in_service", label: "Found it" },
}

export default async function AdminEquipmentPage() {
  const { serviceClient } = await requireAdmin()

  const [{ data: equipment }, { data: bays }] = await Promise.all([
    serviceClient
      .from("equipment")
      .select("id, tag, name, club_type, hand, status, replacement_cost, baseline_photo_url, bay_id")
      .order("tag", { ascending: true }),
    serviceClient.from("bays").select("id, number, name").order("number"),
  ])

  const items = equipment ?? []
  const bayName = (id: string | null) => {
    if (!id) return "Any bay"
    const b = bays?.find((x) => x.id === id)
    return b ? `Bay ${b.number}` : "Unknown"
  }

  const inService = items.filter((i) => i.status === "in_service").length
  const outOfService = items.length - inService
  const noBaseline = items.filter((i) => !i.baseline_photo_url).length

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Equipment</h1>
        <Link href="/admin/incidents" className="text-sm text-neutral-400 transition-colors hover:text-white">
          Incident log
        </Link>
      </div>
      <p className="mb-8 text-sm text-neutral-500">
        Loaner clubs and anything else a customer can break. A tagged item with a baseline photo is
        what makes &ldquo;report pre-existing damage&rdquo; mean something.
      </p>

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: "In service", value: inService },
          { label: "Out of service", value: outOfService },
          { label: "No baseline photo", value: noBaseline },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <details className="mb-8 rounded-xl border border-white/10 bg-white/5">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-white">
          Add an item
        </summary>
        <form action={addEquipment} className="grid gap-4 border-t border-white/10 p-4 sm:grid-cols-2">
          <label className="text-xs text-neutral-400">
            Tag (printed on the grip)
            <input
              name="tag"
              required
              placeholder="C-014"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Name
            <input
              name="name"
              required
              placeholder="TaylorMade Stealth 2 7-iron"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Club type
            <input
              name="club_type"
              placeholder="7-iron"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Hand
            <select
              name="hand"
              defaultValue="right"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            Lives in
            <select
              name="bay_id"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">Any bay</option>
              {bays?.map((b) => (
                <option key={b.id} value={b.id}>
                  Bay {b.number}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            Replacement cost
            <input
              name="replacement_cost"
              type="number"
              step="0.01"
              placeholder="89.00"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Acquired
            <input
              name="acquired_on"
              type="date"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Baseline photo URL
            <input
              name="baseline_photo_url"
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400 sm:col-span-2">
            Notes
            <input
              name="notes"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Add item
            </button>
          </div>
        </form>
      </details>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Hand</th>
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Replace</th>
                <th className="px-4 py-3">Baseline</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const next = NEXT_STATUS[item.status]
                return (
                  <tr key={item.id} className="border-b border-white/5 text-neutral-300">
                    <td className="px-4 py-3 font-mono font-medium">{item.tag}</td>
                    <td className="px-4 py-3">
                      {item.name}
                      {item.club_type && <span className="ml-2 text-xs text-neutral-500">{item.club_type}</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 capitalize">{item.hand ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">{bayName(item.bay_id)}</td>
                    <td className="px-4 py-3 tabular-nums text-neutral-400">
                      {item.replacement_cost ? `$${Number(item.replacement_cost).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.baseline_photo_url ? (
                        <a
                          href={item.baseline_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-neutral-400 underline hover:text-white"
                        >
                          Photo
                        </a>
                      ) : (
                        <span className="text-xs text-amber-400/70">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {next && (
                        <form
                          action={async () => {
                            "use server"
                            await setEquipmentStatus(item.id, next.to)
                          }}
                        >
                          <button type="submit" className="text-xs text-neutral-500 transition-colors hover:text-white">
                            {next.label}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          Nothing tagged yet. Add your loaner clubs and the incident log can point at a specific one.
        </p>
      )}
    </main>
  )
}
