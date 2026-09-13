import Link from "next/link"
import { requireAdmin } from "@/lib/admin/guard"
import { formatFacilityTime } from "@/lib/incidents"
import { logIncident } from "./actions"

export const metadata = { title: "Incidents | Tee365 Admin" }

const CATEGORY_LABEL: Record<string, string> = {
  equipment_damage: "Equipment damage",
  facility_damage: "Facility damage",
  injury: "Injury",
  conduct: "Conduct",
  other: "Other",
}

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-neutral-500/20 text-neutral-400",
  minor: "bg-amber-500/20 text-amber-400",
  major: "bg-red-500/20 text-red-400",
}

const DECISION_LABEL: Record<string, string> = {
  pending: "Pending",
  no_charge: "No charge",
  charged: "Charged",
}

const VIA_LABEL: Record<string, string> = {
  admin: "Admin",
  phone_agent: "Phone agent",
  customer: "Customer",
}

export default async function AdminIncidentsPage() {
  const { serviceClient } = await requireAdmin()

  const [{ data: incidents }, { data: bays }, { data: equipment }] = await Promise.all([
    serviceClient
      .from("incidents")
      .select(
        "id, occurred_at, occurred_at_text, time_confidence, reported_at, reported_via, category, severity, description, status, charge_decision, video_reviewed, bay_id",
      )
      .order("reported_at", { ascending: false })
      .limit(100),
    serviceClient.from("bays").select("id, number").order("number"),
    serviceClient
      .from("equipment")
      .select("id, tag, name")
      .in("status", ["in_service", "damaged"])
      .order("tag"),
  ])

  const rows = incidents ?? []
  const open = rows.filter((r) => r.status === "open")
  const needsVideo = open.filter((r) => !r.video_reviewed && r.occurred_at)
  const bayNumber = (id: string | null) => bays?.find((b) => b.id === id)?.number ?? null

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Incidents</h1>
        <Link href="/admin/equipment" className="text-sm text-neutral-400 transition-colors hover:text-white">
          Equipment
        </Link>
      </div>
      <p className="mb-8 text-sm text-neutral-500">
        Damage, injuries, and conduct. Log the time it happened even if it is a guess, because that
        is what the camera window is built from.
      </p>

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: "Open", value: open.length },
          { label: "Awaiting video review", value: needsVideo.length },
          { label: "Logged all time", value: rows.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
          </div>
        ))}
      </div>

      <details className="mb-8 rounded-xl border border-white/10 bg-white/5">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-white">
          Log an incident
        </summary>
        <form action={logIncident} className="grid gap-4 border-t border-white/10 p-4 sm:grid-cols-2">
          <label className="text-xs text-neutral-400 sm:col-span-2">
            What happened
            <textarea
              name="description"
              required
              rows={3}
              placeholder="Shaft snapped on a normal swing with the loaner 7-iron. Customer called it in."
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>

          <label className="text-xs text-neutral-400">
            When it happened (facility time)
            <input
              name="occurred_at"
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            How sure is that time
            <select
              name="time_confidence"
              defaultValue="approximate"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="exact">Exact, to the minute</option>
              <option value="approximate">Approximate, within 20 min</option>
              <option value="unknown">No idea</option>
            </select>
          </label>

          <label className="text-xs text-neutral-400">
            Bay
            <select
              name="bay_id"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">Unknown</option>
              {bays?.map((b) => (
                <option key={b.id} value={b.id}>
                  Bay {b.number}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            Item involved
            <select
              name="equipment_id"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="">None or not tagged</option>
              {equipment?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tag} · {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-neutral-400">
            Category
            <select
              name="category"
              defaultValue="equipment_damage"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            Severity
            <select
              name="severity"
              defaultValue="minor"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              <option value="info">Info, just a record</option>
              <option value="minor">Minor</option>
              <option value="major">Major, safety or big cost</option>
            </select>
          </label>

          <label className="text-xs text-neutral-400">
            Reported by
            <input
              name="reporter_name"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="text-xs text-neutral-400">
            Their phone
            <input
              name="reporter_phone"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Log it
            </button>
          </div>
        </form>
      </details>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Occurred</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Via</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const n = bayNumber(r.bay_id)
                return (
                  <tr key={r.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/5">
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-400">
                      <Link href={`/admin/incidents/${r.id}`} className="hover:text-white">
                        {r.occurred_at ? formatFacilityTime(r.occurred_at) : "Unknown"}
                        {r.time_confidence === "approximate" && r.occurred_at && (
                          <span className="ml-1 text-neutral-600">~</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/incidents/${r.id}`} className="hover:text-white">
                        <span className="text-xs text-neutral-500">{CATEGORY_LABEL[r.category]}</span>
                        <br />
                        <span className="line-clamp-1">{r.description}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{n ? `Bay ${n}` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{VIA_LABEL[r.reported_via]}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[r.severity]}`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{DECISION_LABEL[r.charge_decision]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "open" ? "bg-blue-500/20 text-blue-400" : "bg-neutral-500/20 text-neutral-400"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Nothing logged yet.</p>
      )}
    </main>
  )
}
