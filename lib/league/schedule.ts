/**
 * Season schedule for the Thursday Night League (rules: lib/league/rules.ts).
 *
 * Each tee time is its own pod of up to 8 teams. Weeks 1 to 7 are a round
 * robin inside the pod (circle method): with 8 teams that is exactly every
 * other team once. With an odd count one team sits out each week (a bye,
 * away = null). Week 8 is the position round, built after week 7 from the
 * standings, so it is not generated here.
 *
 * Two teams share a bay. Bays rotate week to week so nobody is parked on the
 * same bay all season. Pure functions, no database.
 */
export interface Pairing {
  home: string
  away: string | null // null = bye
}

/** Round robin rounds for these team ids. Each round pairs everyone once. */
export function roundRobin(teamIds: string[]): Pairing[][] {
  const ids: (string | null)[] = [...teamIds]
  if (ids.length < 2) return ids.length === 1 ? [[{ home: ids[0]!, away: null }]] : []
  if (ids.length % 2 === 1) ids.push(null)
  const n = ids.length
  const rounds: Pairing[][] = []
  const rot = ids.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const order = [ids[0], ...rot]
    const round: Pairing[] = []
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]
      const b = order[n - 1 - i]
      // Alternate home/away by round so it evens out.
      const [home, away] = r % 2 === 0 ? [a, b] : [b, a]
      if (home === null && away === null) continue
      if (home === null) round.push({ home: away!, away: null })
      else round.push({ home, away })
    }
    rounds.push(round)
    rot.unshift(rot.pop()!)
  }
  return rounds
}

export interface ScheduledMatch {
  weekNo: number
  teeTime: string
  bayNumber: number | null
  home: string
  away: string | null
}

/**
 * Weeks 1..7 for every tee time. Bays: the real matches in a pod are spread
 * over bays 1-4 and shifted by one each week.
 */
export function buildSeason(teamsByTeeTime: Record<string, string[]>, weeks = 7, bays = 4): ScheduledMatch[] {
  const out: ScheduledMatch[] = []
  for (const [teeTime, teamIds] of Object.entries(teamsByTeeTime)) {
    const rounds = roundRobin(teamIds)
    if (rounds.length === 0) continue
    for (let w = 0; w < weeks; w++) {
      const round = rounds[w % rounds.length]
      let slot = 0
      for (const p of round) {
        const bayNumber = p.away === null ? null : ((slot + w) % bays) + 1
        if (p.away !== null) slot++
        out.push({ weekNo: w + 1, teeTime, bayNumber, home: p.home, away: p.away })
      }
    }
  }
  return out
}
