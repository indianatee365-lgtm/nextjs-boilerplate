import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata = { title: "Bays | Tee365 Admin" }

export default async function AdminBaysPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: bays } = await serviceClient
    .from("bays")
    .select("id, number, name, active")
    .order("number")

  const { data: blocked } = await serviceClient
    .from("blocked_times")
    .select("id, bay_id, starts_at, ends_at, reason, bays(name)")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at")
    .limit(20)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white mb-8">Bays &amp; Block Times</h1>

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
                      <td className="px-4 py-3 text-neutral-500">{b.reason ?? "—"}</td>
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
