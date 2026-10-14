"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG } from "@/lib/league"
import { type FreeAgent } from "@/lib/league/free-agents"
import { emailPairing } from "@/lib/league/free-agents-email"

async function admin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") throw new Error("Admins only")
  return db
}

const clean = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)

export interface NewFreeAgent {
  userId: string | null
  name: string
  phone: string
  email: string
  handicap: string
  teePref: string
  notes: string
}

export async function addFreeAgentAction(input: NewFreeAgent): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await admin()
  const name = clean(input.name, 80)
  if (!name) return { ok: false, error: "Add their name." }
  if (!clean(input.phone) && !clean(input.email)) return { ok: false, error: "Add a phone or an email so you can reach them." }
  const { data: league } = await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single()
  const { error } = await db.from("league_free_agents").insert({
    league_id: (league as { id: string }).id,
    user_id: input.userId || null,
    name,
    phone: clean(input.phone, 30) || null,
    email: clean(input.email, 120).toLowerCase() || null,
    handicap: clean(input.handicap, 60) || null,
    tee_pref: clean(input.teePref, 10) || "either",
    notes: String(input.notes ?? "").trim().slice(0, 1000) || null,
    source: "admin",
  })
  if (error) return { ok: false, error: error.code === "23505" ? "They're already on the free agent list." : error.message }
  revalidatePath("/admin/league")
  return { ok: true }
}

/** Pairs two waiting free agents; the first is the captain. Emails both. */
export async function pairFreeAgentsAction(captainId: string, partnerId: string): Promise<{ ok: true; emails: number } | { ok: false; error: string }> {
  const db = await admin()
  if (!captainId || !partnerId || captainId === partnerId) return { ok: false, error: "Pick two different players." }
  const { data } = await db.from("league_free_agents").select("*").in("id", [captainId, partnerId])
  const rows = (data ?? []) as FreeAgent[]
  const captain = rows.find((r) => r.id === captainId)
  const partner = rows.find((r) => r.id === partnerId)
  if (!captain || !partner || captain.status !== "waiting" || partner.status !== "waiting") return { ok: false, error: "Both players must still be waiting." }
  const now = new Date().toISOString()
  await db.from("league_free_agents").update({ status: "paired", paired_with: partner.id, is_captain: true, paired_at: now }).eq("id", captain.id)
  await db.from("league_free_agents").update({ status: "paired", paired_with: captain.id, is_captain: false, paired_at: now }).eq("id", partner.id)
  let emails = 0
  try { emails = await emailPairing(captain, partner) } catch { /* the pairing stands; Jerrod calls them either way */ }
  revalidatePath("/admin/league")
  return { ok: true, emails }
}

/** Splits a pair back into the waiting list. */
export async function unpairFreeAgentAction(id: string) {
  const db = await admin()
  const { data } = await db.from("league_free_agents").select("id, paired_with").eq("id", id).single()
  const ids = [id, (data as { paired_with: string | null } | null)?.paired_with].filter(Boolean)
  await db.from("league_free_agents").update({ status: "waiting", paired_with: null, is_captain: false, paired_at: null }).in("id", ids)
  revalidatePath("/admin/league")
}

export async function removeFreeAgentAction(id: string) {
  const db = await admin()
  await db.from("league_free_agents").update({ status: "removed" }).eq("id", id)
  revalidatePath("/admin/league")
}
