import Link from "next/link"
import { requireAdmin } from "@/lib/admin/guard"
import { describeUnlockMethod } from "@/lib/access-control/door-entries"
import DoorRefresher from "./DoorRefresher"

export const metadata = { title: "Door Log | Tee365 Admin" }
export const dynamic = "force-dynamic"

// Every front-door unlock UniFi has reported to /api/unifi/webhook, newest
// first: customer codes, app unlocks, the owner's own code, events.
export default async function AdminDoorPage() {
  const { serviceClient } = await requireAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (serviceClient as any)
    .from("door_entries")
    .select("id, created_at, actor_name, auth_type, result, first_visit, alerted, bookings(bays(name), profiles!user_id(first_name, last_name))")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (data ?? []) as Array<{
    id: string
    created_at: string
    actor_name: string | null
    auth_type: string | null
    result: string | null
    first_visit: boolean | null
    alerted: boolean
    bookings: {
      bays: { name: string } | null
      profiles: { first_name: string | null; last_name: string | null } | null
    } | null
  }>

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <DoorRefresher />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Door Log</h1>
          <p className="mt-1 text-sm text-neutral-500">Every front door unlock, most recent 200. Texts are set in Settings.</p>
        </div>
        <Link href="/admin/settings" className="text-xs text-neutral-400 hover:text-white">Door text settings</Link>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">No unlocks recorded yet.</p>
      ) : (
        <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
          {rows.map((r) => {
            const customer = [r.bookings?.profiles?.first_name, r.bookings?.profiles?.last_name].filter(Boolean).join(" ")
            const denied = r.result && r.result !== "Access Granted"
            return (
              <div key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="whitespace-nowrap text-xs text-neutral-500 sm:w-32 sm:shrink-0">
                  {new Date(r.created_at).toLocaleString("en-US", {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    timeZone: "America/Indiana/Indianapolis",
                  })}
                </div>
                <div className="text-sm text-white sm:flex-1">
                  {customer || r.actor_name || "Unknown"}
                  {r.bookings?.bays?.name && <span className="text-neutral-500"> &middot; {r.bookings.bays.name}</span>}
                  {r.first_visit && <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 text-xs text-brand">First visit</span>}
                </div>
                <div className="text-xs text-neutral-400 sm:w-24 sm:shrink-0">{describeUnlockMethod(r.auth_type)}</div>
                <div className={`text-xs sm:w-28 sm:shrink-0 ${denied ? "text-red-400" : "text-neutral-500"}`}>
                  {denied ? r.result : r.alerted ? "Texted you" : ""}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
