/**
 * League free agents (2026-10-14): single players looking for a partner.
 * Jerrod adds callers by hand on /admin/league, or players add themselves on
 * /league. Pairing two of them emails both; the captain signs up the team with
 * the partner prefilled, and the partner accepts the usual invite link. Nobody
 * is charged until they are on a confirmed team.
 */
export interface FreeAgent {
  id: string
  league_id: string
  user_id: string | null
  name: string
  phone: string | null
  email: string | null
  handicap: string | null
  tee_pref: string
  notes: string | null
  status: "waiting" | "paired" | "removed"
  paired_with: string | null
  is_captain: boolean
  source: "admin" | "self"
  created_at: string
  paired_at: string | null
}

// Client-safe on purpose (no lib/league import, which pulls in Stripe).
export function teePrefLabel(pref: string): string {
  if (pref === "either") return "Either tee time"
  const [h, m] = pref.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`
}

/** Sign-up link for the captain with the partner already filled in. */
export function captainSignupUrl(partner: Pick<FreeAgent, "name" | "email">): string {
  const q = new URLSearchParams({ partner_name: partner.name })
  if (partner.email) q.set("partner_email", partner.email)
  return `https://tee365.org/league?${q.toString()}#signup`
}

