/**
 * League points (rules: lib/league/rules.ts). Pure functions, no database, so
 * every number on the leaderboard can be re-derived and tested.
 *
 * NET DOUBLE BOGEY (decided 2026-10-08): no hole counts worse than par + 2 +
 * the strokes that player receives on that hole from their own handicap. It
 * applies to everything: match points, team totals, the gross prize and
 * handicaps. The real number entered is kept; the capped one is scored.
 *
 * Learning weeks (1-2): the two teams in a bay compare combined net score.
 * Lower wins 4, a tie is 2 each.
 *
 * Match weeks (3-8): A plays A and B plays B, net, hole by hole. 1 point per
 * hole won, half for a tie, 9 per match. The lower team net total earns 2
 * more (1 each for a tie). 20 per match.
 *
 * Match strokes: the higher handicap player gets the difference (rounded),
 * one per hole on the hardest holes of the nine (ranked by the scorecard's
 * hole handicap), two per hole on the hardest once the difference passes 9.
 *
 * Absences: a missing player forfeits their match (opponent wins all 9) and
 * their team can't win the team points. A whole team missing loses all the
 * points to an opponent who played. A bye earns half the points on offer.
 *
 * Subs: a sub's card scores at the absent player's handicap, but sub rounds
 * never count toward the gross prize (or, in lib/league/handicaps, anyone's
 * handicap).
 *
 * Bay problems (decided 2026-10-10): holes a group couldn't play because the
 * bay failed are listed in `skip` (positions 0-8 in the nine). Both teams in a
 * match share the bay, so it costs both equally: skipped holes are halved in
 * match play, team totals compare only the holes played (net of the strokes
 * that fall on those holes), and the round can't count toward the gross prize.
 * Skipped holes are stored as 0 on the cards.
 */
export interface Hole { par: number; hcp: number }

export interface PlayerCard {
  userId: string
  strokes: number[] | null // 9 gross scores as entered, null = absent
  handicap: number         // 9-hole handicap used this week
  sub?: boolean            // played by a sub
}

export interface TeamCard { teamId: string; a: PlayerCard; b: PlayerCard }

export interface MatchPoints { home: number; away: number; detail: Record<string, unknown> }

export function holesComplete(holes: Hole[]): boolean {
  return holes.length === 9 && holes.every((h) => h.par > 0 && h.hcp > 0)
}

/** How many strokes a handicap gets on each hole, hardest holes first. */
export function strokesByHole(holes: Hole[], diff: number): number[] {
  const n = Math.max(0, Math.round(diff))
  const out = new Array(holes.length).fill(0)
  if (holes.length === 0) return out
  const order = holes.map((h, i) => ({ i, hcp: h.hcp })).sort((x, y) => x.hcp - y.hcp).map((x) => x.i)
  for (let k = 0; k < n; k++) out[order[k % holes.length]] += 1
  return out
}

/** Each hole's net double bogey maximum for a player with this handicap. */
export function holeMaxes(holes: Hole[], handicap: number): number[] | null {
  if (!holesComplete(holes)) return null
  const own = strokesByHole(holes, handicap)
  return holes.map((h, i) => h.par + 2 + own[i])
}

const played = (p: PlayerCard, skip: number[] = []) => Array.isArray(p.strokes) && p.strokes.length === 9 &&
  p.strokes.every((s, i) => skip.includes(i) || (Number.isInteger(s) && s > 0))

/** The card as it is scored: each hole capped at net double bogey. */
export function scoredStrokes(holes: Hole[], p: PlayerCard, skip: number[] = []): number[] | null {
  if (!played(p, skip)) return null
  const max = holeMaxes(holes, p.handicap)
  return p.strokes!.map((s, i) => (skip.includes(i) ? 0 : max ? Math.min(s, max[i]) : s))
}

const gross = (holes: Hole[], p: PlayerCard, skip: number[] = []) => (scoredStrokes(holes, p, skip) ?? []).reduce((t, s) => t + s, 0)
const teamComplete = (t: TeamCard, skip: number[] = []) => played(t.a, skip) && played(t.b, skip)
/** Handicap strokes a player gets on the holes actually played. */
function strokesPlayed(holes: Hole[], handicap: number, skip: number[]): number {
  if (!skip.length) return Math.round(handicap)
  if (holesComplete(holes)) return strokesByHole(holes, handicap).reduce((t, s, i) => t + (skip.includes(i) ? 0 : s), 0)
  return Math.round(handicap * (9 - skip.length) / 9)
}
const teamNet = (holes: Hole[], t: TeamCard, skip: number[] = []) =>
  gross(holes, t.a, skip) + gross(holes, t.b, skip) - strokesPlayed(holes, t.a.handicap, skip) - strokesPlayed(holes, t.b.handicap, skip)

/** One A-vs-A or B-vs-B match: points for each side out of 9. */
export function holeMatch(holes: Hole[], home: PlayerCard, away: PlayerCard, skip: number[] = []): { home: number; away: number; holes: number[] } {
  if (!played(home, skip) && !played(away, skip)) return { home: 0, away: 0, holes: [] }
  if (!played(home, skip)) return { home: 0, away: 9, holes: [] }
  if (!played(away, skip)) return { home: 9, away: 0, holes: [] }
  const hs = scoredStrokes(holes, home, skip)!
  const as = scoredStrokes(holes, away, skip)!
  const diff = Math.round(home.handicap) - Math.round(away.handicap)
  // Without the nine's hole handicaps there is no way to place strokes, so
  // none are given (the admin weeks page must be filled in).
  const shots = holesComplete(holes) ? strokesByHole(holes, Math.abs(diff)) : new Array(9).fill(0)
  let h = 0, a = 0
  const perHole: number[] = []
  for (let i = 0; i < 9; i++) {
    if (skip.includes(i)) { h += 0.5; a += 0.5; perHole.push(0); continue }
    const hn = hs[i] - (diff > 0 ? shots[i] : 0)
    const an = as[i] - (diff < 0 ? shots[i] : 0)
    if (hn < an) { h += 1; perHole.push(1) } else if (an < hn) { a += 1; perHole.push(-1) } else { h += 0.5; a += 0.5; perHole.push(0) }
  }
  return { home: h, away: a, holes: perHole }
}

export function learningWeekPoints(holes: Hole[], home: TeamCard, away: TeamCard | null, skip: number[] = []): MatchPoints {
  const capped = holesComplete(holes)
  if (!away) return { home: 2, away: 0, detail: { bye: true, capped } }
  const hc = teamComplete(home, skip), ac = teamComplete(away, skip)
  if (!hc && !ac) return { home: 0, away: 0, detail: { bothShort: true, capped } }
  if (!hc) return { home: 0, away: 4, detail: { forfeit: "home", capped } }
  if (!ac) return { home: 4, away: 0, detail: { forfeit: "away", capped } }
  const hn = teamNet(holes, home, skip), an = teamNet(holes, away, skip)
  const d = { homeNet: hn, awayNet: an, capped, ...(skip.length ? { skipped: skip } : {}) }
  if (hn < an) return { home: 4, away: 0, detail: d }
  if (an < hn) return { home: 0, away: 4, detail: d }
  return { home: 2, away: 2, detail: d }
}

export function matchWeekPoints(holes: Hole[], home: TeamCard, away: TeamCard | null, skip: number[] = []): MatchPoints {
  const capped = holesComplete(holes)
  if (!away) return { home: 10, away: 0, detail: { bye: true, capped } }
  const nobodyHome = !played(home.a, skip) && !played(home.b, skip)
  const nobodyAway = !played(away.a, skip) && !played(away.b, skip)
  if (nobodyHome && nobodyAway) return { home: 0, away: 0, detail: { bothNoShow: true, capped } }
  if (nobodyHome) return { home: 0, away: 20, detail: { noShow: "home", capped } }
  if (nobodyAway) return { home: 20, away: 0, detail: { noShow: "away", capped } }

  const am = holeMatch(holes, home.a, away.a, skip)
  const bm = holeMatch(holes, home.b, away.b, skip)
  let hTeam = 0, aTeam = 0
  const hc = teamComplete(home, skip), ac = teamComplete(away, skip)
  if (hc && ac) {
    const hn = teamNet(holes, home, skip), an = teamNet(holes, away, skip)
    if (hn < an) hTeam = 2; else if (an < hn) aTeam = 2; else { hTeam = 1; aTeam = 1 }
  } else if (hc && !ac) hTeam = 2
  else if (ac && !hc) aTeam = 2
  return {
    home: am.home + bm.home + hTeam,
    away: am.away + bm.away + aTeam,
    detail: { a: am, b: bm, team: { home: hTeam, away: aTeam }, capped, ...(skip.length ? { skipped: skip } : {}) },
  }
}

/**
 * Team gross for one night (capped at net double bogey), or null when it
 * can't count toward the gross prize: a rostered player was absent, a sub
 * played, or a bay problem cut the round short.
 */
export function teamGross(holes: Hole[], t: TeamCard, skip: number[] = []): number | null {
  if (skip.length || !teamComplete(t) || t.a.sub || t.b.sub) return null
  return gross(holes, t.a) + gross(holes, t.b)
}
