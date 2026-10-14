"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, signupWindow, type League } from "@/lib/league"
import { notifyOwner } from "@/lib/observability/notify"

/** A signed-in player puts themselves on the league free agent list. */
export async function joinFreeAgentsAction(input: { handicap: string; teePref: string; notes: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Sign in first." }
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: leagueRow } = await db.from("leagues").select("*").eq("slug", LEAGUE_SLUG).single()
  const league = leagueRow as League
  const window = signupWindow(league)
  if (!league?.active || window === "closed" || window === "not_open") return { ok: false, error: "League signups aren't open." }
  const { count: onTeam } = await db.from("league_participants").select("id", { count: "exact", head: true })
    .eq("league_id", league.id).eq("user_id", user.id).neq("status", "withdrawn")
  if ((onTeam ?? 0) > 0) return { ok: false, error: "You're already on a team." }

  const { data: p } = await db.from("profiles").select("first_name, last_name, phone").eq("id", user.id).single()
  const prof = p as { first_name: string | null; last_name: string | null; phone: string | null } | null
  const name = `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() || (user.email ?? "Player")
  const handicap = String(input.handicap ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
  const teePref = String(input.teePref ?? "either").slice(0, 10)
  const { error } = await db.from("league_free_agents").insert({
    league_id: league.id,
    user_id: user.id,
    name,
    phone: prof?.phone ?? null,
    email: user.email ?? null,
    handicap: handicap || null,
    tee_pref: teePref,
    notes: String(input.notes ?? "").trim().slice(0, 500) || null,
    source: "self",
  })
  if (error) return { ok: false, error: error.code === "23505" ? "You're already on the free agent list." : "Couldn't add you. Please try again." }
  await notifyOwner(`League free agent: ${name}${handicap ? ` (${handicap})` : ""} wants a partner. tee365.org/admin/league`)
  revalidatePath("/league")
  return { ok: true }
}

export async function leaveFreeAgentsAction(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  await db.from("league_free_agents").update({ status: "removed" }).eq("user_id", user.id).eq("status", "waiting")
  revalidatePath("/league")
}
