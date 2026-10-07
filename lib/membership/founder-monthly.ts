import { logEvent, logFailure } from "@/lib/observability/notify"
import { addDaysToDateKey, easternDateKey, easternMidnightUtc } from "@/lib/time/eastern"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Founders' monthly free hours, decided 2026-10-07.
 *
 * Every active founder gets FOUNDER_MONTHLY_HOURS of bay time each calendar
 * month (Eastern), usable at any open time, expiring at midnight Eastern as
 * the next month starts. They do not roll over. They are ordinary
 * hour_credits rows, so checkout already applies them through "Use my free
 * hours" and /account already shows the balance and expiry.
 *
 * There is no "except league night" rule here on purpose: league night will
 * block every bay it uses, so nobody can book those hours with credits or
 * without.
 *
 * Runs daily (vercel.json) and is idempotent: one row per founder per month,
 * keyed on `reason`, backed by the unique index
 * hour_credits_founder_monthly_uniq. Daily rather than monthly so a missed
 * run is caught the next morning, and a founder who was past due on the 1st
 * gets the month's hours once they are paid up.
 */
export const FOUNDER_MONTHLY_HOURS = 2

export function founderMonthlyReason(monthKey: string): string {
  return `Founders monthly hours ${monthKey}`
}

/** "2026-10" for any instant in October, Eastern. */
export function easternMonthKey(now: Date): string {
  return easternDateKey(now).slice(0, 7)
}

/** Midnight Eastern at the start of the month after `now`'s month. */
export function founderMonthlyExpiry(now: Date): Date {
  const firstOfThisMonth = `${easternMonthKey(now)}-01`
  // 32 days past the 1st always lands in the next month; snap to its 1st.
  const nextMonthKey = addDaysToDateKey(firstOfThisMonth, 32).slice(0, 7)
  return easternMidnightUtc(`${nextMonthKey}-01`)
}

export async function grantFounderMonthlyHours(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<{ granted: number; alreadyHad: number; failed: number }> {
  const monthKey = easternMonthKey(now)
  const reason = founderMonthlyReason(monthKey)
  const expiresAt = founderMonthlyExpiry(now).toISOString()

  const { data: founders } = await db
    .from("memberships")
    .select("user_id")
    .eq("plan_type", "founder")
    .eq("status", "active")
  const userIds = Array.from(new Set(((founders ?? []) as { user_id: string | null }[])
    .map((f) => f.user_id)
    .filter((id): id is string => Boolean(id))))
  if (userIds.length === 0) return { granted: 0, alreadyHad: 0, failed: 0 }

  const { data: existing } = await db
    .from("hour_credits")
    .select("user_id")
    .eq("reason", reason)
    .in("user_id", userIds)
  const has = new Set(((existing ?? []) as { user_id: string }[]).map((r) => r.user_id))

  let granted = 0
  let failed = 0
  for (const userId of userIds) {
    if (has.has(userId)) continue
    const { error } = await db.from("hour_credits").insert({
      user_id: userId,
      hours: FOUNDER_MONTHLY_HOURS,
      hours_remaining: FOUNDER_MONTHLY_HOURS,
      reason,
      expires_at: expiresAt,
      active: true,
      created_by: userId,
      redeemed_at: now.toISOString(),
    })
    if (!error) { granted++; continue }
    // 23505: a concurrent run already granted it. That is the index doing its job.
    if (error.code === "23505") { has.add(userId); continue }
    failed++
    await logFailure(db, "founder-monthly-hours-FAILED",
      `user=${userId} month=${monthKey} err=${String(error.message).slice(0, 200)}`,
      `A founder's ${monthKey} free hours did not get added (user ${userId}). The daily run will retry; check it if this repeats.`)
  }

  await logEvent(db, "founder-monthly-hours-run",
    `month=${monthKey} granted=${granted} already=${has.size} failed=${failed} expires=${expiresAt}`)
  return { granted, alreadyHad: has.size, failed }
}
