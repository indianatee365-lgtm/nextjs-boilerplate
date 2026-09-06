import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { setBayOverride, startTestBooking, requestBayRestart } from "./actions"
import BayStatusRefresher from "./BayStatusRefresher"
import ExtendBookingButton from "./ExtendBookingButton"

export const metadata = { title: "Bays | Tee365 Admin" }

const HEARTBEAT_STALE_AFTER_MS = 60 * 1000

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
    .select("id, bay_id, starts_at, ends_at, reason, bays(name)")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(20)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <BayStatusRefresher />
      <h1 className="text-2xl font-semibold text-white mb-8">Bays &amp; Block Times</h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Live Status</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(bays ?? []).map((bay) => {
            const status = bay.bay_agent_status as unknown as AgentStatus | null
            const online = Boolean(
              status?.last_heartbeat_at &&
              now - new Date(status.last_heartbeat_at).getTime() < HEARTBEAT_STALE_AFTER_MS
            )
            const override = status?.override_state ?? null
            const effectiveState = override ?? status?.session_state ?? null
            const simShouldRun = effectiveState === "occupied"
            const simTrouble = online && simShouldRun && status?.sim_running === false
            const recentKills = (status?.kiosk_kills ?? []).slice(-3).reverse()

            return (
              <div key={bay.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{bay.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? "bg-green-500/20 text-green-400" : "bg-neutral-500/20 text-neutral-400"}`}>
                    {online ? "Agent online" : "Agent offline"}
                  </span>
                </div>

                <p className="text-sm text-neutral-400">
                  {override
                    ? `Override: ${override}`
                    : effectiveState
                      ? `Booking state: ${effectiveState}`
                      : "No status yet"}
                  {status?.enforcement_mode && <span className="ml-2 text-xs text-neutral-600">({status.enforcement_mode})</span>}
                </p>

                {simTrouble && (
                  <p className="text-sm font-medium text-red-400">
                    Should be running during an active rental but isn&apos;t reporting as running.
                  </p>
                )}
                {status?.last_crash_restart_at && (
                  <p className="text-xs text-neutral-500">
                    Last crash-restart: {new Date(status.last_crash_restart_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                  </p>
                )}
                {recentKills.length > 0 && (
                  <p className="text-xs text-neutral-500">
                    Recently blocked: {recentKills.map((k) => k.process).join(", ")}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <form action={async () => { "use server"; await setBayOverride(bay.id, "occupied") }}>
                    <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                      Turn on
                    </button>
                  </form>
                  <form action={async () => { "use server"; await setBayOverride(bay.id, "maintenance") }}>
                    <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                      Maintenance mode
                    </button>
                  </form>
                  <form action={async () => { "use server"; await setBayOverride(bay.id, "available") }}>
                    <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                      Force available
                    </button>
                  </form>
                  {override && (
                    <form action={async () => { "use server"; await setBayOverride(bay.id, null) }}>
                      <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                        Clear override
                      </button>
                    </form>
                  )}
                  <ExtendBookingButton bayId={bay.id} />
                  <form action={async () => { "use server"; await requestBayRestart(bay.id) }}>
                    <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                      Restart simulator
                    </button>
                  </form>
                </div>

                <form action={startTestBooking} className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                  <input type="hidden" name="bayId" value={bay.id} />
                  <select
                    name="durationMinutes"
                    defaultValue="15"
                    className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-neutral-300"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                  </select>
                  <input
                    type="email"
                    name="customerEmail"
                    placeholder="Customer email (blank = you)"
                    className="w-48 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-600"
                  />
                  <button type="submit" className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30">
                    Start test booking
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Bays</h2>
        <div className="rounded-xl border border-white/10 overflow-hidden">
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

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Upcoming Block Times</h2>
        {blocked && blocked.length > 0 ? (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Bay</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((b) => {
                  const bay = b.bays as { name: string } | null
                  return (
                    <tr key={b.id} className="border-b border-white/5 text-neutral-300">
                      <td className="px-4 py-3">{bay?.name ?? "All bays"}</td>
                      <td className="px-4 py-3">{new Date(b.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className="px-4 py-3">{new Date(b.ends_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}</td>
                      <td className="px-4 py-3 text-neutral-500">{b.reason ?? "N/A"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No upcoming block times. Use the Block Time button in Manage Bookings to add one.</p>
        )}
      </section>
    </main>
  )
}
