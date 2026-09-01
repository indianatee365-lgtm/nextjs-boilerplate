// Shared bay auto-selection, used by every place a bay gets picked for a
// customer without them choosing one themselves (web time-slot clicks, the
// "book now, next available" shortcut, and phone bookings) - Jerrod never
// wants a customer picking their own bay off a list, but the bay chosen on
// their behalf still needs to be a good one. Before this, every call site
// independently just took the first bay in ascending `number` order, which
// meant bay 1 always won when open and back-to-back customers landed in
// adjacent bays with zero separation. Root-caused and fixed 2026-09-01.
//
// Pure, framework-agnostic logic (no DB/network calls) so it behaves
// identically on the client (BookingFlow.tsx, which already has a full
// per-bay availability grid on hand) and on the server (the phone booking
// webhook) - only the caller differs in how it gathers `busyBayNumbers`
// and `loadByBayId`.

export interface BaySelectable {
  id: string
  number: number
}

/**
 * Picks the best bay from a list of candidates that can all actually
 * fulfill the request (right duration, right time - filtering that out is
 * the caller's job). Two-stage choice:
 *
 *   1. Prefer whichever candidate is numerically furthest from any bay
 *      that's already busy overlapping this same time window - bays are
 *      laid out in a row (1-2-3-4), so |number - number| is a real
 *      physical distance. If bay 1 is taken and both bay 3 and bay 4 are
 *      free, bay 4 wins (distance 3 vs distance 2).
 *   2. Break any tie (including "nothing is busy yet, every candidate
 *      ties at maximum distance") by whichever candidate has the lightest
 *      existing load today - keeps a quiet day from defaulting back to the
 *      same low-numbered bay every single time, which was the other half
 *      of the complaint (bay 3 barely getting used).
 *
 * Spacing is a preference among otherwise-available bays, never a reason
 * to reject one - if only an adjacent bay can fit, it's still returned.
 * Returns null only when `candidates` itself is empty.
 */
export function pickBestBay<T extends BaySelectable>(
  candidates: T[],
  busyBayNumbers: number[],
  loadByBayId: Map<string, number> = new Map()
): T | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const scored = candidates.map((c) => ({
    candidate: c,
    distance: busyBayNumbers.length === 0
      ? Infinity // nothing else booked around this time - spacing doesn't apply, go straight to load
      : Math.min(...busyBayNumbers.map((n) => Math.abs(c.number - n))),
    load: loadByBayId.get(c.id) ?? 0,
  }))

  const bestDistance = Math.max(...scored.map((s) => s.distance))
  const atBestDistance = scored.filter((s) => s.distance === bestDistance)
  const bestLoad = Math.min(...atBestDistance.map((s) => s.load))
  const tied = atBestDistance.filter((s) => s.load === bestLoad)

  // A genuine tie (same spacing, same load - most commonly a totally
  // empty day, every bay equally free) breaks randomly rather than by
  // whichever candidate happened to sort first. A first-wins tiebreak here
  // would have quietly recreated the exact "always defaults to bay 1" bug
  // this whole thing exists to fix, since `bays` is always fetched in
  // ascending number order everywhere it's used.
  const pick = tied[Math.floor(Math.random() * tied.length)]
  return pick.candidate
}
