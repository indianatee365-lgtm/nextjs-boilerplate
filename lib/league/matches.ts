import { easternDateKey } from "@/lib/time/eastern"
import { LEAGUE_SLUG } from "@/lib/league"
import { learningWeekPoints, matchWeekPoints, teamGross, type Hole, type PlayerCard, type TeamCard } from "@/lib/league/points"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Loading a match for score entry, and turning entered scores into points.
 * See lib/league/points.ts for the math and lib/league/rules.ts for the rules.
 */
export interface MatchPlayer { userId: string; name: string; ab: "A" | "B" | null; handicap: number }
export interface MatchTeam { teamId: string; name: string; players: MatchPlayer[] }
export interface MatchView {
  matchId: string
  week: { id: string; weekNo: number; playDate: string; kind: "learning" | "match" | "finale"; course: string; nine: string; holes: Hole[]; cancelled: boolean }
  teeTime: string
  bayNumber: number | null
  home: MatchTeam
  away: MatchTeam | null
  cards: Record<string, number[] | null>
  result: { status: string; enteredTeamId: string | null; enteredAt: string; disputeNote: string | null; homePoints: number | null; awayPoints: number | null } | null
}

/**
 * The 9-hole handicap a player plays to this week. Phase 2B uses the starting
 * handicap from signup; phase 2C replaces this with the league handicap
 * (90% of the best 2 of the last 4 rounds, capped at start + 3).
 */
export async function playerHandicaps(db: SupabaseClient, leagueId: string, userIds: string[]): Promise<Map<string, number>> {
  const { data } = await db.from("league_participants").select("user_id, starting_handicap").eq("league_id", leagueId).in("user_id", userIds)
  return new Map(((data ?? []) as { user_id: string; starting_handicap: number | null }[]).map((r) => [r.user_id, Number(r.starting_handicap ?? 0)]))
}

async function loadTeam(db: SupabaseClient, leagueId: string, teamId: string, hcp: Map<string, number>): Promise<MatchTeam> {
  const { data: team } = await db.from("league_teams").select("id, name").eq("id", teamId).single()
  const { data: parts } = await db.from("league_participants")
    .select("user_id, ab, profiles!league_participants_user_id_fkey(first_name, last_name)")
    .eq("league_id", leagueId).eq("team_id", teamId)
  const players = ((parts ?? []) as { user_id: string; ab: "A" | "B" | null; profiles: { first_name: string; last_name: string } | null }[])
    .map((p) => ({
      userId: p.user_id,
      name: p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}`.trim() : "Player",
      ab: p.ab,
      handicap: hcp.get(p.user_id) ?? 0,
    }))
    .sort((x, y) => (x.ab ?? "Z").localeCompare(y.ab ?? "Z") || x.handicap - y.handicap)
  return { teamId, name: (team as { name: string }).name, players }
}

export async function loadMatch(db: SupabaseClient, matchId: string): Promise<MatchView | null> {
  const { data: m } = await db.from("league_matches")
    .select("id, league_id, tee_time, bay_number, home_team_id, away_team_id, league_weeks(id, week_no, play_date, kind, course, nine, holes, cancelled)")
    .eq("id", matchId).maybeSingle()
  if (!m) return null
  const w = m.league_weeks as { id: string; week_no: number; play_date: string; kind: MatchView["week"]["kind"]; course: string; nine: string; holes: Hole[]; cancelled: boolean }
  const { data: parts } = await db.from("league_participants").select("user_id").eq("league_id", m.league_id)
    .in("team_id", [m.home_team_id, m.away_team_id].filter(Boolean))
  const hcp = await playerHandicaps(db, m.league_id, ((parts ?? []) as { user_id: string }[]).map((p) => p.user_id))
  const [home, away] = await Promise.all([
    loadTeam(db, m.league_id, m.home_team_id, hcp),
    m.away_team_id ? loadTeam(db, m.league_id, m.away_team_id, hcp) : Promise.resolve(null),
  ])
  const { data: cards } = await db.from("league_scorecards").select("user_id, strokes").eq("match_id", matchId)
  const { data: res } = await db.from("league_results").select("*").eq("match_id", matchId).maybeSingle()
  return {
    matchId,
    week: { id: w.id, weekNo: w.week_no, playDate: w.play_date, kind: w.kind, course: w.course, nine: w.nine, holes: w.holes ?? [], cancelled: w.cancelled },
    teeTime: m.tee_time,
    bayNumber: m.bay_number,
    home,
    away,
    cards: Object.fromEntries(((cards ?? []) as { user_id: string; strokes: number[] | null }[]).map((c) => [c.user_id, c.strokes])),
    result: res ? {
      status: res.status, enteredTeamId: res.entered_team_id, enteredAt: res.entered_at, disputeNote: res.dispute_note,
      homePoints: res.home_points === null ? null : Number(res.home_points), awayPoints: res.away_points === null ? null : Number(res.away_points),
    } : null,
  }
}

/** This player's match: tonight's, else the most recent one still open. */
export async function findPlayerMatchId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: league } = await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single()
  const { data: part } = await db.from("league_participants").select("team_id").eq("league_id", (league as { id: string }).id).eq("user_id", userId).maybeSingle()
  const teamId = (part as { team_id: string | null } | null)?.team_id
  if (!teamId) return null
  const today = easternDateKey(new Date())
  const { data: ms } = await db.from("league_matches")
    .select("id, league_weeks!inner(play_date), league_results(status)")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .lte("league_weeks.play_date", today)
  const rows = ((ms ?? []) as { id: string; league_weeks: { play_date: string }; league_results: { status: string } | { status: string }[] | null }[])
    .map((r) => ({ id: r.id, date: r.league_weeks.play_date, status: Array.isArray(r.league_results) ? r.league_results[0]?.status : r.league_results?.status }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const tonight = rows.find((r) => r.date === today)
  if (tonight) return tonight.id
  return rows.find((r) => r.status !== "confirmed")?.id ?? rows[0]?.id ?? null
}

function toTeamCard(team: MatchTeam, cards: Record<string, number[] | null>): TeamCard {
  const [p1, p2] = team.players
  const card = (p?: MatchPlayer): PlayerCard => ({ userId: p?.userId ?? "missing", strokes: p ? (cards[p.userId] ?? null) : null, handicap: p?.handicap ?? 0 })
  // A/B once assigned (week 3 on); before that the order doesn't matter.
  const a = team.players.find((p) => p.ab === "A") ?? p1
  const b = team.players.find((p) => p.ab === "B") ?? p2
  return { teamId: team.teamId, a: card(a), b: card(b) }
}

/** Computes points from the stored cards and marks the result confirmed. */
export async function confirmMatch(db: SupabaseClient, matchId: string, confirmedBy: string | null): Promise<void> {
  const view = await loadMatch(db, matchId)
  if (!view) throw new Error("Match not found")
  const home = toTeamCard(view.home, view.cards)
  const away = view.away ? toTeamCard(view.away, view.cards) : null
  const points = view.week.kind === "learning"
    ? learningWeekPoints(home, away)
    : matchWeekPoints(view.week.holes, home, away)
  const handicaps = Object.fromEntries([...view.home.players, ...(view.away?.players ?? [])].map((p) => [p.userId, p.handicap]))
  await db.from("league_results").upsert({
    match_id: matchId,
    status: "confirmed",
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    home_points: points.home,
    away_points: points.away,
    home_gross: teamGross(home),
    away_gross: away ? teamGross(away) : null,
    detail: points.detail,
    handicaps,
  })
}
