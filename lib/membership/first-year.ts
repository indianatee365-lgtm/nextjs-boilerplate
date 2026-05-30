/**
 * Determine whether a membership is still within its first-year (founder) discount window.
 *
 * For founders, year_one_discount_expires_at is set at signup to the absolute end date
 * (1 year from opening, NOT 1 year from join). For other plans it is null, in which case
 * we fall back to started_at + 1 year as a safe default.
 */
export function isInFirstYear(membership: {
  started_at: string | Date
  year_one_discount_expires_at?: string | null
} | null | undefined): boolean {
  if (!membership) return false
  if (membership.year_one_discount_expires_at) {
    return new Date() < new Date(membership.year_one_discount_expires_at)
  }
  const startedAt = new Date(membership.started_at)
  const oneYearLater = new Date(startedAt)
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
  return new Date() < oneYearLater
}
