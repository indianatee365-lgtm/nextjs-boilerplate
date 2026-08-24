import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata = { title: "My Shots | Tee365" }

export default async function ShotsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: shots } = await serviceClient
    .from("shots")
    .select("id, created_at, club, carry_yards, ball_speed_mph, club_speed_mph, side_spin, back_spin, hla, vla, hitter_name, bays(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">My Shots</h1>
        {shots && shots.length > 0 && (
          <a href="/api/account/shots/export" className="btn-secondary px-3 py-2 text-sm">
            Download CSV
          </a>
        )}
      </div>

      {!shots || shots.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No shots recorded yet. Once you hit balls during a session at a bay, they&apos;ll show up here automatically.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Bay</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Club</th>
                <th className="px-4 py-3">Carry (yd)</th>
                <th className="px-4 py-3">Ball speed</th>
                <th className="px-4 py-3">Club speed</th>
                <th className="px-4 py-3">Spin (side/back)</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((s) => {
                const bay = s.bays as { name: string } | null
                return (
                  <tr key={s.id} className="border-b border-white/5 text-neutral-300">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        timeZone: "America/Indiana/Indianapolis",
                      })}
                    </td>
                    <td className="px-4 py-3">{bay?.name ?? "—"}</td>
                    <td className="px-4 py-3">{s.hitter_name ?? "—"}</td>
                    <td className="px-4 py-3">{s.club ?? "—"}</td>
                    <td className="px-4 py-3">{s.carry_yards != null ? Number(s.carry_yards).toFixed(1) : "—"}</td>
                    <td className="px-4 py-3">{s.ball_speed_mph != null ? `${Number(s.ball_speed_mph).toFixed(1)} mph` : "—"}</td>
                    <td className="px-4 py-3">{s.club_speed_mph != null ? `${Number(s.club_speed_mph).toFixed(1)} mph` : "—"}</td>
                    <td className="px-4 py-3">
                      {s.side_spin != null ? Math.round(Number(s.side_spin)) : "—"}
                      {" / "}
                      {s.back_spin != null ? Math.round(Number(s.back_spin)) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
