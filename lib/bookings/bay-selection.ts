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
 * How much clear air a bay wants either side of a booking before the handoff
 * stops feeling like a handoff.
 *
 * Back-to-back bookings cost the incoming customer real time: the bay agent
 * needs a few minutes to reset the sim between sessions, so they walk in and
 * wait while their paid hour is already running. That is tolerable when the
 * place is full and obviously unfair when three bays are sitting dark, which
 * is exactly what happened on 2026-09-13 - three bookings stacked back to back
 * to back on bay 3 because wear balancing had nothing else to push against.
 */
export const TURNOVER_COMFORT_MINUTES = 30

/**
 * Minutes between a requested window and the nearest other booking on the same
 * bay, per bay. Infinity (absent from the map) means that bay has nothing else
 * anywhere near this time.
 *
 * Note this is deliberately blind to whether the neighbour is before or after:
 * following someone costs you the reset, and being followed means someone is
 * hovering while you finish. Both are worth avoiding when a clean bay exists.
 */
export function buildAdjacencyGaps(
  bookings: { bay_id: string | null; starts_at: string; ends_at: string }[],
  requestedStart: Date,
  requestedEnd: Date
): Map<string, number> {
  const start = requestedStart.getTime()
  const end = requestedEnd.getTime()
  const gaps = new Map<string, number>()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return gaps

  for (const b of bookings) {
    if (!b.bay_id) continue
    const bStart = new Date(b.starts_at).getTime()
    const bEnd = new Date(b.ends_at).getTime()
    if (!Number.isFinite(bStart) || !Number.isFinite(bEnd) || bEnd <= bStart) continue

    let gap: number
    if (bEnd <= start) gap = (start - bEnd) / 60000
    else if (bStart >= end) gap = (bStart - end) / 60000
    else gap = 0 // overlapping; the caller filters these bays out before we get here

    const prev = gaps.get(b.bay_id)
    if (prev === undefined || gap < prev) gaps.set(b.bay_id, gap)
  }
  return gaps
}

/**
 * The same measurement taken from the browser's half-hour availability grid,
 * which is all the client has. Counts free slots either side of the requested
 * block until it hits a taken one; running off either end of the day means
 * nothing is near, so the gap is unbounded.
 *
 * Approximate by nature - the grid is half-hour resolution and only covers one
 * day - but the server re-runs the real selection on every booking, so this
 * only has to be good enough to show the customer the same bay they will get.
 */
export function slotGridGap(
  slots: { available: boolean }[],
  startIdx: number,
  neededSlots: number,
  slotMinutes = 30
): number {
  let before = 0
  for (let i = startIdx - 1; i >= 0; i--) {
    if (!slots[i].available) break
    before++
  }
  let after = 0
  for (let i = startIdx + neededSlots; i < slots.length; i++) {
    if (!slots[i].available) break
    after++
  }

  const hitDayStart = before === startIdx
  const hitDayEnd = startIdx + neededSlots + after >= slots.length

  return Math.min(
    hitDayStart ? Infinity : before * slotMinutes,
    hitDayEnd ? Infinity : after * slotMinutes
  )
}

/**
 * Picks the best bay from a list of candidates that can all actually
 * fulfill the request (right duration, right time - filtering that out is
 * the caller's job). Two-stage choice:
 *
 *   1. Prefer a bay with clear air either side of the requested window.
 *      "Away from other customers" is a distance in time as well as space,
 *      and the time one costs real money: a back-to-back handoff eats the
 *      next customer's first few minutes while the sim resets. A bay whose
 *      nearest neighbouring booking is TURNOVER_COMFORT_MINUTES or more
 *      away carries no penalty at all, so on a busy day when everything is
 *      tight this tier ties and the rest of the ordering decides as before.
 *   2. Then whichever candidate is numerically furthest from any bay with
 *      somebody in it around this time - either overlapping the window
 *      outright, or close enough either side to count as cramped. Bays are
 *      laid out in a row (1-2-3-4), so |number - number| is a real
 *      physical distance. If bay 1 is taken and both bay 3 and bay 4 are
 *      free, bay 4 wins (distance 3 vs distance 2). Counting the cramped
 *      bays here is what makes the booking after a session move away from
 *      the bay that session was in, rather than merely off it.
 *   3. Break any tie (including "nothing is busy yet, every candidate
 *      ties at maximum distance") by whichever candidate has been worked
 *      least over the last WEAR_WINDOW_DAYS, measured in booked minutes.
 *      This is what spreads wear and tear evenly: a bay that is behind
 *      stays preferred until it catches up.
 *   4. Then by least recently used, which settles the ordinary case of
 *      several bays sitting at identical wear.
 *
 * Spacing is a preference among otherwise-available bays, never a reason
 * to reject one - if only an adjacent bay can fit, it's still returned.
 * Returns null only when `candidates` itself is empty.
 */
export function pickBestBay<T extends BaySelectable>(
  candidates: T[],
  busyBayNumbers: number[],
  usageByBayId: Map<string, BayUsage> = new Map(),
  adjacencyByBayId: Map<string, number> = new Map()
): T | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  // Spacing has to reckon with bays that are about to empty or about to fill,
  // not only bays occupied for the whole of this window. The customer finishing
  // at 19:00 is still in the building at 19:00, so a 19:00 booking should move
  // away from their bay - but their booking does not overlap the window, so
  // busyBayNumbers alone never saw them and spacing silently stopped applying
  // the moment the previous session ended.
  const crampedNumbers = candidates
    .filter((c) => (adjacencyByBayId.get(c.id) ?? Infinity) < TURNOVER_COMFORT_MINUTES)
    .map((c) => c.number)
  const spacingRefs = Array.from(new Set([...busyBayNumbers, ...crampedNumbers]))

  const scored = candidates.map((c) => {
    const usage = usageByBayId.get(c.id)
    // Absent from the map means nothing else is booked near this window on
    // this bay, so the penalty floors at zero rather than going negative and
    // beating a genuinely clear bay.
    const gapMinutes = adjacencyByBayId.get(c.id) ?? Infinity
    return {
      candidate: c,
      turnoverPenalty: Math.max(0, TURNOVER_COMFORT_MINUTES - gapMinutes),
      // A cramped bay measures zero distance to itself, which is correct: it
      // is the bay somebody just walked out of.
      distance: spacingRefs.length === 0
        ? Infinity // genuinely nobody near this time - spacing doesn't apply, go straight to wear
        : Math.min(...spacingRefs.map((n) => Math.abs(c.number - n))),
      minutes: usage?.minutes ?? 0,
      // Never used sorts oldest, so a bay nobody has booked wins the
      // recency tiebreak outright instead of losing it to a null check.
      lastUsedAt: usage?.lastUsedAt ?? -Infinity,
    }
  })

  // Clear air first. When every candidate is equally clear (the common case on
  // a quiet day) or equally cramped (a full evening), this tier ties and the
  // spacing and wear rules below decide exactly as they did before.
  const leastCramped = Math.min(...scored.map((s) => s.turnoverPenalty))
  const restful = scored.filter((s) => s.turnoverPenalty === leastCramped)

  const bestDistance = Math.max(...restful.map((s) => s.distance))
  const atBestDistance = restful.filter((s) => s.distance === bestDistance)

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
