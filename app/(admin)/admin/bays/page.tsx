import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BayStatusRefresher from "./BayStatusRefresher"
import BayCard, { type BayCardData } from "./BayCard"
import { blockBaysUntilCleared, clearBlockedTime } from "./actions"

export const metadata = { title: "Bay Control | Tee365 Admin" }

const HEARTBEAT_STALE_AFTER_MS = 60 * 1000

interface ConflictRow {
  id: string
  starts_at: string
  bay_id: string | null
  bays: { name: string } | null
  profiles: { first_name: string; last_name: string | null } | null
}

interface AgentStatus {
  last_heartbeat_at: string | null
  session_state: string | null
  sim_running: boolean | null
  last_crash_restart_at: string | null
  kiosk_kills: { process: string; at: string }[] | null
  override_state: "occupied" | "available" | "maintenance" | null
  enforcement_mode: string | null
}

export default async function AdminBaysPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: bays } = await serviceClient
    .from("bays")
    .select("id, number, name, active, bay_agent_status(last_heartbeat_at, session_state, sim_running, last_crash_restart_at, kiosk_kills, override_state, enforcement_mode)")
    .order("number")

  const now = Date.now()

  const { data: blocked } = await serviceClient
    .from("blocked_times")
    .select("id, bay_id, starts_at, ends_at, reason, indefinite, bays(name)")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(20)

  const indefiniteBayIds = (blocked ?? [])
    .filter((b) => b.indefinite && b.bay_id)
    .map((b) => b.bay_id as string)

  let blockedBayConflicts: ConflictRow[] = []
  if (indefiniteBayIds.length > 0) {
    const { data: conflicts } = await serviceClient
      .from("bookings")
      .select("id, starts_at, bay_id, bays(name), profiles!user_id(first_name, last_name)")
      .in("bay_id", indefiniteBayIds)
      .in("status", ["pending", "confirmed"])
      .gt("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(25)
    blockedBayConflicts = (conflicts ?? []) as unknown as ConflictRow[]
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <BayStatusRefresher />
      <h1 className="text-2xl font-semibold text-white mb-8">Bay Control</h1>

      <section className="mb-10">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-white">Live Status</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            The big word on each card is what the bay is actually doing, reported by the agent itself.
            Everything else explains why.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {(bays ?? []).map((bay) => {
            const status = bay.bay_agent_status as unknown as AgentStatus | null
            const heartbeatMs = status?.last_heartbeat_at
              ? now - new Date(status.last_heartbeat_at).getTime()
              : null
            const online = heartbeatMs !== null && heartbeatMs < HEARTBEAT_STALE_AFTER_MS

            const data: BayCardData = {
              bayId: bay.id,
              name: bay.name,
              online,
              heartbeatAgo: heartbeatMs === null
                ? null
                : heartbeatMs < 60_000
                  ? `heard ${Math.max(1, Math.round(heartbeatMs / 1000))}s ago`
                  : `heard ${Math.round(heartbeatMs / 60_000)}m ago`,
              // session_state is what the agent reports it is really doing, and
              // it already folds in the bay's own local maintenance flag.
              // override_state is only what this page has asked for. Showing
              // the agent's value as the headline (rather than the old
              // `override ?? session_state`) is what makes a disagreement
              // between the two visible instead of hidden.
              actual: status?.session_state ?? null,
              override: status?.override_state ?? null,
              simRunning: status?.sim_running ?? null,
              lastCrashRestartAt: status?.last_crash_restart_at
                ? new Date(status.last_crash_restart_at).toLocaleString("en-US", {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    timeZone: "America/Indiana/Indianapolis",
                  })
                : null,
              recentKills: (status?.kiosk_kills ?? []).slice(-3).reverse().map((k) => k.process),
              enforcementMode: status?.enforcement_mode ?? null,
            }

            return <BayCard key={bay.id} data={data} />
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Bays</h2>
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(bays ?? []).map((bay) => (
                <tr key={bay.id} className="border-b border-white/5 text-neutral-300">
                  <td className="px-4 py-3">#{bay.number}</td>
                  <td className="px-4 py-3">{bay.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bay.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {bay.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-1">Block Bays Until Cleared</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Takes the bay off the booking grid immediately and leaves it off until you clear it.
          No end time to pick and nothing to re-block tomorrow.
        </p>
        <form action={blockBaysUntilCleared} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap gap-3">
            {(bays ?? []).map((bay) => (
              <label
                key={bay.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300 hover:border-brand/40"
              >
                <input type="checkbox" name="bayIds" value={bay.id} className="accent-brand" />
                {bay.name}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="reason"
              placeholder="Reason (optional), e.g. projector out"
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600"
            />
            <button
              type="submit"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
            >
              Block until cleared
            </button>
          </div>
        </form>

        {blockedBayConflicts.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-300">
              {blockedBayConflicts.length} booking{blockedBayConflicts.length === 1 ? "" : "s"} still on a blocked bay
            </p>
            <p className="mt-0.5 text-xs text-amber-200/70">
              Nothing has been cancelled and nobody has been texted. Move or cancel these in Manage Bookings.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
              {blockedBayConflicts.map((c) => {
                const who = c.profiles ? `${c.profiles.first_name} ${c.profiles.last_name ?? ""}`.trim() : "Unknown"
                return (
                  <li key={c.id}>
                    {c.bays?.name ?? "Bay"}, {new Date(c.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}, {who}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Active &amp; Upcoming Blocks</h2>
        {blocked && blocked.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((b) => {
                  const bay = b.bays as { name: string } | null
                  return (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">{bay?.name ?? "All bays"}</td>
                      <td className="px-4 py-3">{new Date(b.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className="px-4 py-3">
                        {b.indefinite
                          ? <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">Until cleared</span>
                          : new Date(b.ends_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{b.reason ?? "N/A"}</td>
                      <td className="px-4 py-3 text-right">
                        <form action={clearBlockedTime.bind(null, b.id)}>
                          <button
                            type="submit"
                            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 transition hover:border-brand/40 hover:text-white"
                          >
                            Clear
                          </button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No active or upcoming blocks. Block a bay until cleared above, or use the Block Time button in Manage Bookings for a fixed window.</p>
        )}
      </section>
    </main>
  )
}
