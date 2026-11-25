/**
 * Folds the second bay of a two-bay booking into its first bay for display,
 * so a customer sees one booking ("Bay 2 and Bay 3", combined total) instead
 * of two rows that look like separate purchases. See lib/bookings/group.ts.
 * Rows whose first bay is not in the list are left as they are.
 */
export function mergeGroupedBookings<
  T extends { id: string; parent_booking_id?: string | null; total: number | string | null; bays: unknown },
>(rows: T[]): (T & { bayNames: string[]; groupTotal: number; isGroup: boolean; groupBays: { id: string; name: string; total: number }[] })[] {
  const statusOf = new Map(rows.map((r) => [r.id, (r as { status?: string }).status]))
  // A cancelled bay of a booking that is still on shows as its own cancelled
  // card, not folded into (and added to the total of) the live one.
  const folds = (r: T) => Boolean(r.parent_booking_id && statusOf.has(r.parent_booking_id) &&
    ((r as { status?: string }).status !== "cancelled" || statusOf.get(r.parent_booking_id) === "cancelled"))
  const ids = new Set(rows.map((r) => r.id))
  const childrenByParent = new Map<string, T[]>()
  for (const r of rows) {
    if (folds(r) && r.parent_booking_id && ids.has(r.parent_booking_id)) {
      childrenByParent.set(r.parent_booking_id, [...(childrenByParent.get(r.parent_booking_id) ?? []), r])
    }
  }
  const nameOf = (r: T) => (r.bays as { name: string } | null)?.name ?? "Bay"
  return rows
    .filter((r) => !folds(r))
    .map((r) => {
      const kids = childrenByParent.get(r.id) ?? []
      return {
        ...r,
        bayNames: [nameOf(r), ...kids.map(nameOf)],
        groupTotal: [r, ...kids].reduce((sum, x) => sum + Number(x.total ?? 0), 0),
        isGroup: kids.length > 0,
        groupBays: [r, ...kids].map((x) => ({ id: x.id, name: nameOf(x), total: Number(x.total ?? 0) })),
      }
    })
}
