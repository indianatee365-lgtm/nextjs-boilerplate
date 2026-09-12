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
 * How hard a bay has been worked recently, used as the fairness tiebreak.
 *
 * Minutes rather than hours so the comparison is exact integer arithmetic -
 * floating-point hours summed from timestamps produce values like 2.0000001
 * that never compare equal and silently defeat the tiebreak below it.
 */
export interface BayUsage {
  /** Booked minutes inside the wear window. */
  minutes: number
  /** Epoch ms of the most recent session start, or null if never used. */
  lastUsedAt: number | null
}

/** How far back bay usage is counted when balancing wear. */
export const WEAR_WINDOW_DAYS = 30

export function wearWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - WEAR_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Folds raw booking rows into per-bay wear totals.
 *
 * Shared so the web and phone booking paths cannot drift apart on what
 * "recently used" means - they previously held separate copies of the load
 * calculation and both carried the same timezone bug.
 */
export function buildBayUsage(
  bookings: { bay_id: string | null; starts_at: string; ends_at: string }[]
): Map<string, BayUsage> {
  const usage = new Map<string, BayUsage>()
  for (const b of bookings) {
    if (!b.bay_id) continue
    const start = new Date(b.starts_at).getTime()
    const end = new Date(b.ends_at).getTime()
    // A row with unparseable or inverted timestamps contributes nothing
    // rather than poisoning a bay's total with NaN, which would make that
    // bay compare unequal to everything and silently win or lose forever.
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue

    const prev = usage.get(b.bay_id)
    usage.set(b.bay_id, {
      minutes: (prev?.minutes ?? 0) + Math.round((end - start) / 60000),
      lastUsedAt: prev?.lastUsedAt == null ? start : Math.max(prev.lastUsedAt, start),
    })
  }
  return usage
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
 *      ties at maximum distance") by whichever candidate has been worked
 *      least over the last WEAR_WINDOW_DAYS, measured in booked minutes.
 *      This is what spreads wear and tear evenly: a bay that is behind
 *      stays preferred until it catches up.
 *   3. Then by least recently used, which settles the ordinary case of
 *      several bays sitting at identical wear.
 *
 * Spacing is a preference among otherwise-available bays, never a reason
 * to reject one - if only an adjacent bay can fit, it's still returned.
 * Returns null only when `candidates` itself is empty.
 */
export function pickBestBay<T extends BaySelectable>(
  candidates: T[],
  busyBayNumbers: number[],
  usageByBayId: Map<string, BayUsage> = new Map()
): T | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const scored = candidates.map((c) => {
    const usage = usageByBayId.get(c.id)
    return {
      candidate: c,
      distance: busyBayNumbers.length === 0
        ? Infinity // nothing else booked around this time - spacing doesn't apply, go straight to wear
        : Math.min(...busyBayNumbers.map((n) => Math.abs(c.number - n))),
      minutes: usage?.minutes ?? 0,
      // Never used sorts oldest, so a bay nobody has booked wins the
      // recency tiebreak outright instead of losing it to a null check.
      lastUsedAt: usage?.lastUsedAt ?? -Infinity,
    }
  })

  const bestDistance = Math.max(...scored.map((s) => s.distance))
  const atBestDistance = scored.filter((s) => s.distance === bestDistance)

  // Least worked wins. This used to be "fewest bookings started today",
  // which reset every midnight and so could never correct a standing
  // imbalance - on 2026-09-11 bay 1 had run 30 hours against bay 3's 12.3
  // and nothing in the selection was pulling that back. Counting minutes
  // over a rolling window does, because a bay that is behind stays
  // preferred until it catches up.
  const leastWorked = Math.min(...atBestDistance.map((s) => s.minutes))
  const atLeastWorked = atBestDistance.filter((s) => s.minutes === leastWorked)

  // Then least recently used, which is what settles the common case of
  // several bays sitting at identical wear.
  const oldest = Math.min(...atLeastWorked.map((s) => s.lastUsedAt))
  const tied = atLeastWorked.filter((s) => s.lastUsedAt === oldest)

  // A genuine tie (same spacing, same load - most commonly a totally
  // empty day, every bay equally free) breaks randomly rather than by
  // whichever candidate happened to sort first. A first-wins tiebreak here
  // would have quietly recreated the exact "always defaults to bay 1" bug
  // this whole thing exists to fix, since `bays` is always fetched in
  // ascending number order everywhere it's used.
  const pick = tied[Math.floor(Math.random() * tied.length)]
  return pick.candidate
}
