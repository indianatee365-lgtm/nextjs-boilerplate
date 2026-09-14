import { logFailure } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * What free hours a plan grants at signup, in one place.
 *
 * This existed as scattered literals: the Stripe webhook set
 * memberships.signup_bonus_hours = 2 for eagle with a 90-day expiry, set the
 * same 2 for founder, and then separately inserted an hour_credits row for
 * FOUNDER ONLY. lib/membership/giveaway.ts set the membership fields for both
 * plans and inserted no credit row at all.
 *
 * The membership column is only a display promise. hour_credits is the ledger
 * createBooking() actually spends from. So every Eagle member since launch saw
 * "2 free hrs remaining" on their account page while checkout had nothing to
 * apply, and a member standing in the bay on 2026-09-13 asked how to use hours
 * that were never spendable. Three Eagle members were affected and backfilled
 * by hand.
 *
 * Both the amount and the expiry now live here, and both membership-creating
 * paths call grantSignupBonus, so the promise and the ledger cannot disagree
 * again.
 */

export interface SignupBonus {
  hours: number
  /** null means it never expires. */
  expiresAt: string | null
  reason: string
}

const EAGLE_BONUS_DAYS = 90

/**
 * Founder hours deliberately never expire: they were sold for Friends &
 * Founders Day (2026-08-29), and a capacity or scheduling conflict that day
 * shouldn't forfeit the benefit. Eagle hours run 90 days from signup.
 */
export function signupBonusFor(planSlug: string, now: Date): SignupBonus | null {
  if (planSlug === "founder") {
    return { hours: 2, expiresAt: null, reason: "Founders Day 2026" }
  }
  if (planSlug === "eagle") {
    const expiry = new Date(now)
    expiry.setDate(expiry.getDate() + EAGLE_BONUS_DAYS)
    return { hours: 2, expiresAt: expiry.toISOString(), reason: "Eagle signup bonus" }
  }
  return null
}

/**
 * Write the spendable hour_credits row. Call this after the membership row
 * exists, from every path that creates a membership.
 *
 * A failure here is not cosmetic: the member has been told they have free
 * hours and the ledger disagrees, which is exactly the bug this module exists
 * to prevent, so it alerts rather than only logging.
 */
export async function grantSignupBonus(
  client: SupabaseClient,
  params: { userId: string; planSlug: string; now: Date; sourceLabel: string }
): Promise<void> {
  const { userId, planSlug, now, sourceLabel } = params
  const bonus = signupBonusFor(planSlug, now)
  if (!bonus) return

  const { error } = await client.from("hour_credits").insert({
    user_id: userId,
    hours: bonus.hours,
    hours_remaining: bonus.hours,
    reason: bonus.reason,
    expires_at: bonus.expiresAt,
    active: true,
    created_by: userId,
    redeemed_at: now.toISOString(),
  })

  if (error) {
    await logFailure(client, "signup-bonus-credit-FAILED",
      `user=${userId} plan=${planSlug} ${sourceLabel} hours=${bonus.hours} err=${JSON.stringify(error).slice(0, 200)}`,
      `ALERT Signup bonus hours NOT granted, ${planSlug} member ${userId}. Their account shows ${bonus.hours} free hours they cannot spend. Add the credit by hand.`)
  }
}
