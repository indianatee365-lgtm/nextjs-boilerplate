import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, teeTimeLabel, type League } from "@/lib/league"
import { getStandings } from "@/lib/league/standings"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "League standings | Tee365" }

export default async function LeagueStandingsPage() {
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: leagueRow } = await db.from("leagues").select("*").eq("slug", LEAGUE_SLUG).maybeSingle()
  const league = leagueRow as League | null
  if (!league) notFound()
  if (!league.active) {
    const { data: { user } } = await (await createClient()).auth.getUser()
    let ok = false
    if (user) {
      const { data: p } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle()
      ok = (p as { role: string } | null)?.role === "admin" || (league.preview_user_ids ?? []).includes(user.id)
    }
    if (!ok) notFound()
  }

  const { rows, pot, weeks } = await getStandings(db)

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header>
        <Link href="/league" className="text-sm text-neutral-400 hover:text-white">&larr; {league.name}</Link>
        <h1 className="mt-2 text-3xl font-semibold text-white">Standings</h1>
        <p className="mt-2 text-sm text-neutral-300">
          Cash pot so far: <span className="font-semibold text-white">${pot.toFixed(2)}</span>. 100% of it is paid out at the finale.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-right">Points</th><th className="px-3 py-2 text-right">Gross avg</th><th className="px-3 py-2 text-right">Played</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-neutral-300">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">Standings start after week one.</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.teamId}>
                <td className="px-3 py-2 text-neutral-500">{i + 1}</td>
                <td className="px-3 py-2"><span className="font-medium text-white">{r.name}</span> <span className="text-xs text-neutral-500">{teeTimeLabel(r.teeTime)}</span></td>
                <td className="px-3 py-2 text-right font-semibold text-white">{r.points}</td>
                <td className="px-3 py-2 text-right">{r.grossAvg ?? "-"}{r.grossAvg !== null && r.grossRounds < 6 ? <span className="text-xs text-neutral-500"> ({r.grossRounds})</span> : null}</td>
                <td className="px-3 py-2 text-right">{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Gross avg is the team&apos;s combined gross per round; a team needs 6 of 8 rounds with both players to qualify for the low gross prize. The number in brackets is rounds so far.</p>

      {weeks.map((w) => (
        <section key={w.weekNo}>
          <h2 className="mb-2 text-sm font-semibold text-white">Week {w.weekNo} &middot; {w.course}</h2>
          <ul className="space-y-1 text-sm text-neutral-300">
            {w.results.map((r, i) => (
              <li key={i}>{r.home} {r.homePoints}{r.away ? ` · ${r.away} ${r.awayPoints}` : " (bye)"}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
