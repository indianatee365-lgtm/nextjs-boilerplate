// How long an unpaid booking holds its bay.
//
// A booking is created `pending` with a Stripe PaymentIntent and only becomes
// `confirmed` once payment lands. Until 2026-09-18 the row simply stayed
// `pending` until /api/cron/cancel-stale happened to sweep it, and every
// availability check counted any `pending` row as busy. Since that cron runs
// every 15 minutes and the hold is itself 15 minutes, a bay nobody had paid for
// could sit unbookable for nearly 30 minutes - invisible to the website AND the
// phone agent. Found live on 2026-09-18: a phone booking created at 11:54:51
// went stale at 12:09:51 but was not swept until 12:15:38, holding bay 2 for
// 20.6 minutes. The day before, one customer's three abandoned checkout
// attempts held bays 2 and 4 the same way.
//
// The hold now expires on the clock rather than on the sweep: an expired
// `pending` row stops blocking availability at exactly PENDING_HOLD_MINUTES,
// whenever the cron gets round to flipping its status. The cron is still what
// cancels the PaymentIntent and sends the "payment didn't go through" nudge, so
// it is housekeeping now, not the gatekeeper.
export const PENDING_HOLD_MINUTES = 15

/** Oldest `created_at` a pending booking can have and still hold its bay. */
export function pendingHoldCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - PENDING_HOLD_MINUTES * 60 * 1000)
}

/**
 * PostgREST `or` filter selecting bookings that genuinely occupy a bay:
 * anything confirmed, plus pending bookings still inside their hold window.
 *
 * Used in place of `.in("status", ["pending", "confirmed"])` on every
 * customer-facing availability path. Admin views deliberately keep the plain
 * status filter, since an operator should still see stale pendings.
 */
export function holdsBayFilter(now: Date = new Date()): string {
  const cutoff = pendingHoldCutoff(now).toISOString()
  return `status.eq.confirmed,and(status.eq.pending,created_at.gt.${cutoff})`
}
