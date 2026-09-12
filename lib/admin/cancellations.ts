/**
 * What counts as a cancellation, in one place.
 *
 * A booking that never completed payment was never cancelled: the customer
 * picked a slot, did not finish checking out, and the hold was released
 * automatically. Counting those as cancellations made /admin/cancellations
 * report 17 when the real number was 3, and reported $522.50 forfeited when
 * nobody had forfeited anything.
 *
 * The definition lived in two places - the dashboard's count query and the
 * cancellations page's row query - so fixing the page on 2026-09-12 left the
 * dashboard card still showing 17. Both now call through here, because the
 * next view that needs this will otherwise be the third copy to drift.
 */

// The Supabase query builders are generic and chainable; this file follows the
// same `any` convention the rest of lib/ uses for them rather than importing
// a different client type per caller.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Bookings that were paid for and then cancelled. `since` is an ISO string.
 */
export function filterRealCancellations(query: any, since: string): any {
  return query
    .eq("status", "cancelled")
    .not("cancelled_at", "is", null)
    .gte("cancelled_at", since)
    .not("paid_at", "is", null)
}

/**
 * The other half: a slot was held, payment never completed, the hold lapsed.
 * Worth watching as lost conversions, but not a cancellation and not lost
 * revenue.
 */
export function filterAbandonedCheckouts(query: any, since: string): any {
  return query
    .eq("status", "cancelled")
    .not("cancelled_at", "is", null)
    .gte("cancelled_at", since)
    .is("paid_at", null)
}
