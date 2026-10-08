/**
 * League points (rules: lib/league/rules.ts). Pure functions, no database, so
 * every number on the leaderboard can be re-derived and tested.
 *
 * Learning weeks (1-2): the two teams in a bay compare combined net score
 * (gross minus each player's handicap). Lower wins 4, a tie is 2 each.
 *
 * Match weeks (3-8): A plays A and B plays B, net, hole by hole. 1 point per
 * hole won, half for a tie, 9 per match. The lower team net total earns 2
 * more (1 each for a tie). 20 per match.
 *
 * Strokes: the higher handicap player gets the difference (rounded), one per
 * hole on the hardest holes of the nine (ranked by the scorecard's hole
 * handicap), two per hole on the hardest once the difference passes 9.
 *
 * Absences: a missing player forfeits their match (opponent wins all 9) and
 * their team can't win the team points. A whole team missing loses all 20
 * (or all 4) to an opponent who played. A bye earns half the points on offer.
 */
export interface Hole { par: number; hcp: number }

export interface PlayerCard {
  userId: string
  strokes: number[] | null // 9 gross scores, null = absent
  handicap: number         // 9-hole handicap used this week
}

export interface TeamCard { teamId: string; a: PlayerCard; b: PlayerCard }

export interface MatchPoints { home: number; away: number; detail: Record<string, unknown> }

const played = (p: PlayerCard) => Array.isArray(p.strokes) && p.strokes.length === 9 && p.strokes.every((s) => Number.isInteger(s) && s > 0)
const gross = (p: PlayerCard) => (p.strokes ?? []).reduce((t, s) => t + s, 0)
const teamComplete = (t: TeamCard) => played(t.a) && played(t.b)
const teamNet = (t: TeamCard) => gross(t.a) + gross(t.b) - Math.round(t.a.handicap) - Math.round(t.b.handicap)

/** How many strokes the higher handicap player gets on each of the 9 holes. */
export function strokesByHole(holes: Hole[], diff: number): number[] {
  const n = Math.max(0, Math.round(diff))
  const order = holes.map((h, i) => ({ i, hcp: h.hcp })).sort((x, y) => x.hcp - y.hcp).map((x) => x.i)
  const out = new Array(holes.length).fill(0)
  for (let k = 0; k < n; k++) out[order[k % holes.length]] += 1
  return out
}

/** One A-vs-A or B-vs-B match: points for each side out of 9. */
export function holeMatch(holes: Hole[], home: PlayerCard, away: PlayerCard): { home: number; away: number; holes: number[] } {
  if (!played(home) && !played(away)) return { home: 0, away: 0, holes: [] }
  if (!played(home)) return { home: 0, away: 9, holes: [] }
  if (!played(away)) return { home: 9, away: 0, holes: [] }
  const diff = Math.round(home.handicap) - Math.round(away.handicap)
  // Without the nine's hole handicaps there is no way to place strokes, so
  // none are given (the admin weeks page must be filled in before week 3).
  const shots = holes.length === 9 && holes.every((h) => h.hcp > 0)
    ? strokesByHole(holes, Math.abs(diff))
    : new Array(9).fill(0)
  let h = 0, a = 0
  const perHole: number[] = []
  for (let i = 0; i < 9; i++) {
    const hn = home.strokes![i] - (diff > 0 ? shots[i] : 0)
    const an = away.strokes![i] - (diff < 0 ? shots[i] : 0)
    if (hn < an) { h += 1; perHole.push(1) } else if (an < hn) { a += 1; perHole.push(-1) } else { h += 0.5; a += 0.5; perHole.push(0) }
  }
  return { home: h, away: a, holes: perHole }
}

export function learningWeekPoints(home: TeamCard, away: TeamCard | null): MatchPoints {
  if (!away) return { home: 2, away: 0, detail: { bye: true } }
  const hc = teamComplete(home), ac = teamComplete(away)
  if (!hc && !ac) return { home: 0, away: 0, detail: { bothShort: true } }
  if (!hc) return { home: 0, away: 4, detail: { forfeit: "home" } }
  if (!ac) return { home: 4, away: 0, detail: { forfeit: "away" } }
  const hn = teamNet(home), an = teamNet(away)
  if (hn < an) return { home: 4, away: 0, detail: { homeNet: hn, awayNet: an } }
  if (an < hn) return { home: 0, away: 4, detail: { homeNet: hn, awayNet: an } }
  return { home: 2, away: 2, detail: { homeNet: hn, awayNet: an } }
}

export function matchWeekPoints(holes: Hole[], home: TeamCard, away: TeamCard | null): MatchPoints {
  if (!away) return { home: 10, away: 0, detail: { bye: true } }
  const nobodyHome = !played(home.a) && !played(home.b)
  const nobodyAway = !played(away.a) && !played(away.b)
  if (nobodyHome && nobodyAway) return { home: 0, away: 0, detail: { bothNoShow: true } }
  if (nobodyHome) return { home: 0, away: 20, detail: { noShow: "home" } }
  if (nobodyAway) return { home: 20, away: 0, detail: { noShow: "away" } }

  const am = holeMatch(holes, home.a, away.a)
  const bm = holeMatch(holes, home.b, away.b)
  let hTeam = 0, aTeam = 0
  const hc = teamComplete(home), ac = teamComplete(away)
  if (hc && ac) {
    const hn = teamNet(home), an = teamNet(away)
    if (hn < an) hTeam = 2; else if (an < hn) aTeam = 2; else { hTeam = 1; aTeam = 1 }
  } else if (hc && !ac) hTeam = 2
  else if (ac && !hc) aTeam = 2
  return {
    home: am.home + bm.home + hTeam,
    away: am.away + bm.away + aTeam,
    detail: { a: am, b: bm, team: { home: hTeam, away: aTeam } },
  }
}

/** Team gross for one night, or null if either rostered player didn't play. */
export function teamGross(t: TeamCard): number | null {
  return teamComplete(t) ? gross(t.a) + gross(t.b) : null
}
