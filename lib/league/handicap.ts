/**
 * Starting 9-hole handicap from what a player told us at signup
 * (rules: lib/league/rules.ts, "Handicaps").
 *
 *   An 18-hole handicap index  -> half of it.
 *   A typical 18-hole score    -> (score - 72) / 2, never below 0.
 *
 * Capped at 18 strokes over 9 holes, rounded to one decimal. The commissioner
 * can adjust any starting handicap afterwards.
 */
export function startingNineHoleHandicap(basis: unknown, raw: unknown): { basis: "index" | "typical_score"; value: number; nine: number } | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (basis === "index") {
    if (value < -5 || value > 54) return null
    return { basis, value, nine: round1(Math.min(18, value / 2)) }
  }
  if (basis === "typical_score") {
    if (value < 55 || value > 160) return null
    return { basis, value, nine: round1(Math.min(18, Math.max(0, (value - 72) / 2))) }
  }
  return null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
