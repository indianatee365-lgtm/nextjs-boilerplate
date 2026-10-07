import Stripe from "stripe"
import { addDaysToDateKey, easternMidnightUtc } from "@/lib/time/eastern"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Thursday Night League, decided with Jerrod 2026-10-07.
 *
 * Two-person scramble teams, 9 holes, two tee times a night across all four
 * bays (two teams per bay). A captain signs up and invites a partner; the team
 * is confirmed once the partner accepts. Every player needs an account, a
 * card on file (the weekly fee is charged to it) and the waiver.
 *
 * Signup opens in windows, keeping promises already sold: Founders were
 * promised a guaranteed league slot, Eagle and Albatross "early league
 * registration". Admins skip the windows so the season can be previewed.
 */
export const LEAGUE_SLUG = "thursday-night"
export const COMMISSIONER_NAME = "Jerrod"
export const COMMISSIONER_PHONE_DISPLAY = "(574) 444-9365"
export const COMMISSIONER_PHONE_TEL = "+15744449365"

export interface League {
  id: string
  name: string
  slug: string
  description: string | null
  format: string | null
  active: boolean
  starts_on: string
  ends_on: string | null
  skip_dates: string[] | null
  tee_times: string[] | null
  teams_per_tee_time: number
  max_players: number | null
  price_per_session: number | string | null
  prize_pool_per_session: number | string | null
  signup_closes_on: string | null
  founders_opens_at: string | null
  members_opens_at: string | null
  public_opens_at: string | null
}

export type SignupWindow = "not_open" | "founders" | "members" | "public" | "closed"

/** Every league night as YYYY-MM-DD, skipping skip_dates (Thanksgiving). */
export function leagueNights(league: League): string[] {
  const end = league.ends_on ?? league.starts_on
  const skip = new Set(league.skip_dates ?? [])
  const out: string[] = []
  for (let d = league.starts_on; d <= end; d = addDaysToDateKey(d, 7)) {
    if (!skip.has(d)) out.push(d)
  }
  return out
}

/** Signups close at the end of signup_closes_on, Eastern. */
export function signupClosesAt(league: League): Date | null {
  return league.signup_closes_on ? easternMidnightUtc(addDaysToDateKey(league.signup_closes_on, 1)) : null
}

export function signupWindow(league: League, now: Date = new Date()): SignupWindow {
  const t = now.getTime()
  const closes = signupClosesAt(league)
  if (closes && t >= closes.getTime()) return "closed"
  if (league.public_opens_at && t >= new Date(league.public_opens_at).getTime()) return "public"
  if (league.members_opens_at && t >= new Date(league.members_opens_at).getTime()) return "members"
  if (league.founders_opens_at && t >= new Date(league.founders_opens_at).getTime()) return "founders"
  return "not_open"
}

/** Whether someone on this plan (null for no membership) may start a team in this window. */
export function canStartTeam(window: SignupWindow, planSlug: string | null): boolean {
  if (window === "public") return true
  if (window === "members") return planSlug === "founder" || planSlug === "eagle" || planSlug === "albatross"
  if (window === "founders") return planSlug === "founder"
  return false
}

/** "17:30:00" or "17:30" -> "5:30pm" */
export function teeTimeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`
}

/** "17:30:00" -> "17:30" so values compare regardless of seconds. */
export function normalizeTeeTime(t: string): string {
  return t.slice(0, 5)
}

export async function activePlanSlug(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from("memberships")
    .select("membership_plans(slug)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
  return ((data as { membership_plans: { slug: string } | null } | null)?.membership_plans?.slug) ?? null
}

/** True when the customer has at least one saved card the weekly fee can be charged to. */
export async function hasCardOnFile(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await db.from("profiles").select("stripe_customer_id").eq("id", userId).single()
  const customerId = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (!customerId) return false
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
    const methods = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 })
    return methods.data.length > 0
  } catch {
    return false
  }
}

/** Teams holding a spot (pending partner or confirmed) per tee time, keyed "17:30". */
export async function teamsPerTeeTime(db: SupabaseClient, leagueId: string): Promise<Record<string, number>> {
  const { data } = await db
    .from("league_teams")
    .select("tee_time")
    .eq("league_id", leagueId)
    .in("status", ["pending_partner", "confirmed"])
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { tee_time: string }[]) {
    const k = normalizeTeeTime(r.tee_time)
    counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}

export function inviteUrl(token: string): string {
  return `https://tee365.org/league/join/${token}`
}
