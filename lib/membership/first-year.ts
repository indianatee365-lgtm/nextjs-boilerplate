/**
 * The founder year-one bonus discount ends for everyone at the same moment,
 * one year from opening rather than one year from each member's join date.
 * 2027-09-01T03:59:59Z is 11:59:59 PM Eastern on 8/31/27, so the last
 * discounted day is 8/31 and the rate drops at midnight going into 9/1/27.
 *
 * Founders get membership_plans.discount_percent (20%) permanently and
 * first_year_discount (30%) until this date - the "bonus" is those 10 points.
 *
 * This lived as a bare `new Date("2027-09-01T03:59:59Z")` literal in both the
 * Stripe webhook's founder insert and lib/membership/giveaway.ts. Reinstating
 * a cancelled founder would have made it three copies, and a duplicated metric
 * definition has drifted on us four separate times. One constant, one meaning.
 */
export const FOUNDER_YEAR_ONE_DISCOUNT_EXPIRES = new Date("2027-09-01T03:59:59Z")

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

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  founder: "Founder's Club",
  eagle: "Eagle",
  birdie: "Birdie",
}
