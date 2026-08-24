import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import ShotsRealtimeRefresher from "../ShotsRealtimeRefresher"

export const metadata = { title: "Session Shots | Tee365" }

export default async function SessionShotsPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: shots } = await serviceClient
    .from("shots")
    .select("id, created_at, club, carry_yards, total_distance_yards, ball_speed_mph, club_speed_mph, side_spin, back_spin, hla, vla, hitter_name, bays(name)")
    .eq("booking_id", bookingId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (!shots || shots.length === 0) notFound()

  const bay = shots[0].bays as { name: string } | null
  const sessionDate = shots[0].created_at

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <ShotsRealtimeRefresher userId={user.id} bookingId={bookingId} />
      <Link href="/account/shots" className="text-sm text-neutral-400 hover:text-white">
        &larr; My Shots
      </Link>

      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {new Date(sessionDate).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
              timeZone: "America/Indiana/Indianapolis",
            })}
          </h1>
          <p className="text-sm text-neutral-400">
            {bay?.name} · {shots.length} shot{shots.length === 1 ? "" : "s"}
          </p>
        </div>
        <a href={`/api/account/shots/export?bookingId=${bookingId}`} className="btn-secondary px-3 py-2 text-sm">
          Download CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Club</th>
              <th className="px-4 py-3">Carry (yd)</th>
              <th className="px-4 py-3">Total (yd)</th>
              <th className="px-4 py-3">Ball speed</th>
              <th className="px-4 py-3">Club speed</th>
              <th className="px-4 py-3">Spin (side/back)</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s) => (
              <tr key={s.id} className="border-b border-white/5 text-neutral-300">
                <td className="px-4 py-3 whitespace-nowrap">
                  {new Date(s.created_at).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit", second: "2-digit",
                    timeZone: "America/Indiana/Indianapolis",
                  })}
                </td>
                <td className="px-4 py-3">{s.hitter_name ?? "—"}</td>
                <td className="px-4 py-3">{s.club ?? "—"}</td>
                <td className="px-4 py-3">{s.carry_yards != null ? Number(s.carry_yards).toFixed(1) : "—"}</td>
                <td className="px-4 py-3">{s.total_distance_yards != null ? Number(s.total_distance_yards).toFixed(1) : "—"}</td>
                <td className="px-4 py-3">{s.ball_speed_mph != null ? `${Number(s.ball_speed_mph).toFixed(1)} mph` : "—"}</td>
                <td className="px-4 py-3">{s.club_speed_mph != null ? `${Number(s.club_speed_mph).toFixed(1)} mph` : "—"}</td>
                <td className="px-4 py-3">
                  {s.side_spin != null ? Math.round(Number(s.side_spin)) : "—"}
                  {" / "}
                  {s.back_spin != null ? Math.round(Number(s.back_spin)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
