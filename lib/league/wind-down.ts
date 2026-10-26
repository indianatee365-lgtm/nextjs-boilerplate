import type { SupabaseClient } from "@supabase/supabase-js"
import { LEAGUE_SLUG, signupClosesAt, type League } from "@/lib/league"
import { sendLeaguePlayerText } from "@/lib/telnyx/sms"
import { sendLeagueCancelledEmail } from "@/lib/resend/email"
import { logEvent, notifyOwner } from "@/lib/observability/notify"

/**
 * Fall 2026 Thursday Night League go/no-go (jerrod, 2026-10-26). Runs once from
 * vercel.json on Wed 10/28 8:07am Eastern, after signups close at the end of
 * Tue 10/27, so a late team still counts.
 *
 * Four or more real teams: nothing changes, jerrod gets a "it's a go" text.
 * Fewer: the league is called off.
 *   1. league switched off (no charges, texts, banner, home page band, signups)
 *   2. every remaining week marked cancelled
 *   3. the all-bay Thursday blocks removed so the bays sell again
 *   4. one free bay hour for every player, no expiry
 *   5. a thank-you text (email when there is no phone) promising first crack
 *      at January's league, with a feedback question
 *   6. those players recorded for January's early access (league-first-crack)
 *   7. a summary text to jerrod
 * Every step checks what is already done, so a rerun never repeats one. The
 * league row itself is kept as the template for January.
 */

const MIN_TEAMS = 4
const OWNER_ID = "40ef3d05-369a-4f04-ae2c-5e1bf7dce3f0"
const CREDIT_REASON = "Thank you: Thursday Night League fall 2026 (called off)"
const DONE_EVENT = "league-wind-down-complete"

type Team = { id: string; name: string; status: string; invite_token: string | null }
type Player = { userId: string; teamId: string | null; teamName: string | null; firstName: string; phone: string | null }

const isRehearsal = (t: Team) => (t.invite_token ?? "").startsWith("rehearsal-")

export function windDownText(p: Player, partnerFirst: string | null): string {
  const team = p.teamName ? ` with ${p.teamName}` : ""
  const crack = partnerFirst ? `you and ${partnerFirst} get first crack` : "you get first crack"
  return `Hi ${p.firstName}, thanks for signing up for Thursday Night League${team}. We didn't get enough teams to run it this fall, so I'm calling it off. Nothing was charged. As a thank you there's a free hour of bay time on your account, and ${crack} at signups when it comes back in January. Would anything have made it easier to get more teams to sign up? - jerrod, Tee365`
}

export async function runLeagueWindDown(db: SupabaseClient, opts: { dry: boolean; now?: Date }) {
  const now = opts.now ?? new Date()
  const steps: string[] = []

  const { data: leagueRow } = await db.from("leagues").select("*").eq("slug", LEAGUE_SLUG).single()
  const league = leagueRow as (League & { id: string; preview_user_ids: string[] | null }) | null
  if (!league) return { decision: "no-league", steps }

  const closes = signupClosesAt(league)
  if (!closes || now < closes) return { decision: "signups-still-open", closesAt: closes?.toISOString() ?? null, steps }

  const { data: done } = await db.from("admin_logs").select("id").eq("event", DONE_EVENT).limit(1)
  if ((done ?? []).length > 0) return { decision: "already-done", steps }

  const { data: teamRows } = await db.from("league_teams").select("id, name, status, invite_token").eq("league_id", league.id)
  const teams = ((teamRows ?? []) as Team[]).filter((t) => !isRehearsal(t))
  const confirmed = teams.filter((t) => t.status === "confirmed")

  if (confirmed.length >= MIN_TEAMS) {
    steps.push(`go: ${confirmed.length} confirmed teams`)
    if (!opts.dry) {
      await notifyOwner(`League signups closed with ${confirmed.length} confirmed teams. It's a go: generate the schedule today so texts and charges can run.`)
      await logEvent(db, DONE_EVENT, `decision=go teams=${confirmed.length}`)
    }
    return { decision: "go", teams: confirmed.length, steps }
  }

  // Everyone involved: players on every non-rehearsal team (confirmed or not)
  // and any free agents.
  const teamIds = teams.map((t) => t.id)
  const { data: partRows } = teamIds.length
    ? await db.from("league_participants").select("user_id, team_id, active").in("team_id", teamIds)
    : { data: [] }
  const { data: faRows } = await db.from("league_free_agents").select("user_id").eq("league_id", league.id)
  const ids = new Map<string, string | null>()
  for (const r of (partRows ?? []) as { user_id: string; team_id: string; active: boolean | null }[]) {
    if (r.active !== false && r.user_id) ids.set(r.user_id, r.team_id)
  }
  for (const r of (faRows ?? []) as { user_id: string | null }[]) {
    if (r.user_id && !ids.has(r.user_id)) ids.set(r.user_id, null)
  }
  const { data: profRows } = ids.size
    ? await db.from("profiles").select("id, first_name, phone").in("id", [...ids.keys()])
    : { data: [] }
  const players: Player[] = ((profRows ?? []) as { id: string; first_name: string | null; phone: string | null }[]).map((p) => {
    const teamId = ids.get(p.id) ?? null
    return {
      userId: p.id,
      teamId,
      teamName: teams.find((t) => t.id === teamId)?.name ?? null,
      firstName: (p.first_name ?? "there").trim() || "there",
      phone: p.phone,
    }
  })
  steps.push(`no-go: ${confirmed.length} confirmed teams, ${players.length} players`)

  // 1-2. League off, remaining weeks cancelled.
  steps.push("league switched off")
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" })
  const { data: weekRows } = await db.from("league_weeks").select("id, play_date, cancelled").eq("league_id", league.id).gte("play_date", todayKey)
  const toCancel = ((weekRows ?? []) as { id: string; cancelled: boolean }[]).filter((w) => !w.cancelled)
  steps.push(`${toCancel.length} weeks marked cancelled`)
  // 3. The league's own all-bay blocks from here on.
  const { data: blockRows } = await db.from("blocked_times").select("id").is("bay_id", null).eq("reason", "Thursday Night League").gte("starts_at", now.toISOString())
  const blocks = (blockRows ?? []) as { id: string }[]
  steps.push(`${blocks.length} Thursday blocks removed`)

  if (!opts.dry) {
    await db.from("leagues").update({ active: false }).eq("id", league.id)
    if (toCancel.length) await db.from("league_weeks").update({ cancelled: true }).in("id", toCancel.map((w) => w.id))
    if (blocks.length) await db.from("blocked_times").delete().in("id", blocks.map((b) => b.id))
  }

  // 4. One free hour each, unless already granted.
  const { data: existing } = players.length
    ? await db.from("hour_credits").select("user_id").eq("reason", CREDIT_REASON).in("user_id", players.map((p) => p.userId))
    : { data: [] }
  const already = new Set(((existing ?? []) as { user_id: string }[]).map((r) => r.user_id))
  const toCredit = players.filter((p) => !already.has(p.userId))
  steps.push(`free hour for: ${toCredit.map((p) => p.firstName).join(", ") || "nobody new"}`)
  if (!opts.dry && toCredit.length) {
    const stamp = new Date().toISOString()
    await db.from("hour_credits").insert(toCredit.map((p) => ({
      user_id: p.userId, hours: 1, hours_remaining: 1, reason: CREDIT_REASON,
      expires_at: null, active: true, created_by: OWNER_ID, redeemed_at: stamp,
    })))
  }

  // 5. Thank-you messages, once each (mark written before sending, removed on
  // failure, the same pattern as the league texts).
  const { data: sentRows } = await db.from("admin_logs").select("detail").eq("event", "league-wind-down-message")
  const sent = new Set(((sentRows ?? []) as { detail: string }[]).map((r) => r.detail.split(" ")[0]))
  let messages = 0
  for (const p of players) {
    const mark = `u=${p.userId}`
    if (sent.has(mark)) continue
    const partner = players.find((o) => o.teamId && o.teamId === p.teamId && o.userId !== p.userId)
    const body = windDownText(p, partner?.firstName ?? null)
    let email: string | null = null
    if (!p.phone) {
      const { data: au } = await db.auth.admin.getUserById(p.userId)
      email = au?.user?.email ?? null
    }
    steps.push(`${p.phone ? "text" : email ? "email" : "NO CONTACT"} to ${p.firstName}`)
    if (opts.dry || (!p.phone && !email)) continue
    const { data: markRow } = await db.from("admin_logs").insert({ event: "league-wind-down-message", detail: `${mark} via=${p.phone ? "sms" : "email"}` }).select("id").single()
    try {
      if (p.phone) await sendLeaguePlayerText({ to: p.phone, body, kind: "league-called-off" })
      else await sendLeagueCancelledEmail({ to: email!, firstName: p.firstName, body })
      messages++
    } catch (e) {
      if (markRow) await db.from("admin_logs").delete().eq("id", (markRow as { id: string }).id)
      await logEvent(db, "league-wind-down-message-FAILED", `${mark} err=${String(e).slice(0, 200)}`)
    }
  }

  // 6. First crack at January: kept on this league row (the January template)
  // and logged so it can't be lost.
  const firstCrack = players.map((p) => p.userId)
  steps.push(`first crack in January: ${players.map((p) => p.firstName).join(", ")}`)
  if (!opts.dry) {
    const preview = Array.from(new Set([...(league.preview_user_ids ?? []), ...firstCrack]))
    await db.from("leagues").update({ preview_user_ids: preview }).eq("id", league.id)
    await logEvent(db, "league-first-crack", `next_league_early_access users=${firstCrack.join(",")} names=${players.map((p) => p.firstName).join(",")}`)
    await logEvent(db, DONE_EVENT, `decision=no-go teams=${confirmed.length} players=${players.length} messages=${messages} weeks=${toCancel.length} blocks=${blocks.length}`)
    await notifyOwner(
      `League called off (${confirmed.length} teams by the deadline). Done: league off, ${blocks.length} Thursday nights unblocked, ` +
      `free hour + thank-you sent to ${players.map((p) => p.firstName).join(", ")} (${messages} sent). They're on January's first-crack list.`,
    )
  }

  return { decision: "no-go", teams: confirmed.length, steps }
}
