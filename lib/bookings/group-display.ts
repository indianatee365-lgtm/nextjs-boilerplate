/**
 * Folds the second bay of a two-bay booking into its first bay for display,
 * so a customer sees one booking ("Bay 2 and Bay 3", combined total) instead
 * of two rows that look like separate purchases. See lib/bookings/group.ts.
 * Rows whose first bay is not in the list are left as they are.
 */
export function mergeGroupedBookings<
  T extends { id: string; parent_booking_id?: string | null; total: number | string | null; bays: unknown },
>(rows: T[]): (T & { bayNames: string[]; groupTotal: number; isGroup: boolean })[] {
  const ids = new Set(rows.map((r) => r.id))
  const childrenByParent = new Map<string, T[]>()
  for (const r of rows) {
    if (r.parent_booking_id && ids.has(r.parent_booking_id)) {
      childrenByParent.set(r.parent_booking_id, [...(childrenByParent.get(r.parent_booking_id) ?? []), r])
    }
  }
  const nameOf = (r: T) => (r.bays as { name: string } | null)?.name ?? "Bay"
  return rows
    .filter((r) => !(r.parent_booking_id && ids.has(r.parent_booking_id)))
    .map((r) => {
      const kids = childrenByParent.get(r.id) ?? []
      return {
        ...r,
        bayNames: [nameOf(r), ...kids.map(nameOf)],
        groupTotal: [r, ...kids].reduce((sum, x) => sum + Number(x.total ?? 0), 0),
        isGroup: kids.length > 0,
      }
    })
}
