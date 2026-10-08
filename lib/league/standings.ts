import { LEAGUE_SLUG } from "@/lib/league"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Season standings from confirmed results only (rules: "Prizes").
 *   points      total points, all weeks
 *   grossAvg    team gross per round, averaged over rounds both rostered
 *               players played (needs 6 of 8 to qualify for the gross prize)
 *   pot         $5 of every successful $30 charge
 */
export interface StandingRow {
  teamId: string
  name: string
  teeTime: string
  points: number
  played: number
  grossRounds: number
  grossAvg: number | null
}

export async function getStandings(db: SupabaseClient): Promise<{
  rows: StandingRow[]
  pot: number
  weeks: { weekNo: number; course: string; results: { home: string; away: string | null; homePoints: number; awayPoints: number }[] }[]
}> {
  const { data: league } = await db.from("leagues").select("id, price_per_session, prize_pool_per_session").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; price_per_session: number; prize_pool_per_session: number }
  const [{ data: teams }, { data: matches }, { data: charges }] = await Promise.all([
    db.from("league_teams").select("id, name, tee_time").eq("league_id", l.id).eq("status", "confirmed"),
    db.from("league_matches").select("id, home_team_id, away_team_id, league_weeks(week_no, course), league_results(status, home_points, away_points, home_gross, away_gross)").eq("league_id", l.id),
    db.from("league_charges").select("amount").eq("league_id", l.id).eq("status", "succeeded"),
  ])
  const rows = new Map<string, StandingRow & { grossSum: number }>()
  for (const t of (teams ?? []) as { id: string; name: string; tee_time: string }[]) {
    rows.set(t.id, { teamId: t.id, name: t.name, teeTime: t.tee_time, points: 0, played: 0, grossRounds: 0, grossAvg: null, grossSum: 0 })
  }
  const weekMap = new Map<number, { weekNo: number; course: string; results: { home: string; away: string | null; homePoints: number; awayPoints: number }[] }>()
  type M = { home_team_id: string; away_team_id: string | null; league_weeks: { week_no: number; course: string }; league_results: { status: string; home_points: number; away_points: number; home_gross: number | null; away_gross: number | null } | { status: string; home_points: number; away_points: number; home_gross: number | null; away_gross: number | null }[] | null }
  for (const m of (matches ?? []) as M[]) {
    const r = Array.isArray(m.league_results) ? m.league_results[0] : m.league_results
    if (!r || r.status !== "confirmed") continue
    const add = (teamId: string | null, pts: number, gross: number | null) => {
      if (!teamId) return
      const row = rows.get(teamId)
      if (!row) return
      row.points += Number(pts)
      row.played += 1
      if (gross !== null && gross !== undefined) { row.grossRounds += 1; row.grossSum += gross }
    }
    add(m.home_team_id, r.home_points, r.home_gross)
    add(m.away_team_id, r.away_points, r.away_gross)
    const wk = weekMap.get(m.league_weeks.week_no) ?? { weekNo: m.league_weeks.week_no, course: m.league_weeks.course, results: [] }
    wk.results.push({
      home: rows.get(m.home_team_id)?.name ?? "?",
      away: m.away_team_id ? rows.get(m.away_team_id)?.name ?? "?" : null,
      homePoints: Number(r.home_points), awayPoints: Number(r.away_points),
    })
    weekMap.set(wk.weekNo, wk)
  }
  const out = [...rows.values()].map(({ grossSum, ...r }) => ({ ...r, grossAvg: r.grossRounds ? Math.round((grossSum / r.grossRounds) * 10) / 10 : null }))
    .sort((a, b) => b.points - a.points || (a.grossAvg ?? 999) - (b.grossAvg ?? 999))
  const per = Number(l.price_per_session) || 30
  const potShare = Number(l.prize_pool_per_session) / per
  const pot = ((charges ?? []) as { amount: number }[]).reduce((t, c) => t + Number(c.amount) * potShare, 0)
  return { rows: out, pot: Math.round(pot * 100) / 100, weeks: [...weekMap.values()].sort((a, b) => b.weekNo - a.weekNo) }
}
