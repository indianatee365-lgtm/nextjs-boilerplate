import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import {
  activePlanSlug,
  canStartTeam,
  hasCardOnFile,
  inviteUrl,
  normalizeTeeTime,
  signupWindow,
  teamsPerTeeTime,
  teeTimeLabel,
  type League,
} from "@/lib/league"
import { recordLeagueWaiver } from "@/lib/league/waiver"
import { sendLeaguePartnerInviteEmail } from "@/lib/league/messages"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"

/**
 * A captain starts a team. The team holds a spot in its tee time straight
 * away (or goes on the waitlist when both are full) and is confirmed once the
 * partner accepts through the invite link. See lib/league.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to sign up a team" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const teamName = typeof body.teamName === "string" ? body.teamName.trim().slice(0, 40) : ""
  const teePick = typeof body.teeTime === "string" ? body.teeTime : "either"
  const partnerName = typeof body.partnerName === "string" ? body.partnerName.trim().slice(0, 60) : ""
  const partnerEmailRaw = typeof body.partnerEmail === "string" ? body.partnerEmail.trim().slice(0, 120) : ""
  const partnerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmailRaw) ? partnerEmailRaw : null

  if (!teamName) return NextResponse.json({ error: "Give your team a name" }, { status: 400 })
  if (!partnerName) return NextResponse.json({ error: "Who's your partner?" }, { status: 400 })
  if (body.agreedToWaiver !== true || body.authorizedCharges !== true) {
    return NextResponse.json({ error: "Agree to the waiver and the weekly charge to continue" }, { status: 400 })
  }

  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: leagueRow } = await service.from("leagues").select("*").eq("id", body.leagueId).maybeSingle()
  const league = leagueRow as League | null
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 })

  const { data: profile } = await service.from("profiles").select("role, first_name, last_name").eq("id", user.id).single()
  const p = profile as { role: string; first_name: string; last_name: string } | null
  const isAdmin = p?.role === "admin"

  if (!league.active && !isAdmin) return NextResponse.json({ error: "This league isn't open yet" }, { status: 403 })
  const window = signupWindow(league)
  if (!isAdmin) {
    if (window === "closed") return NextResponse.json({ error: "Signups for this league have closed" }, { status: 409 })
    if (!canStartTeam(window, await activePlanSlug(service, user.id))) {
      return NextResponse.json({ error: "Signups aren't open for you yet. Check the dates on this page." }, { status: 403 })
    }
  }

  const { data: existing } = await service
    .from("league_participants").select("id").eq("league_id", league.id).eq("user_id", user.id).maybeSingle()
  if (existing) return NextResponse.json({ error: "You're already signed up for this league" }, { status: 409 })

  if (!(await hasCardOnFile(service, user.id))) {
    return NextResponse.json({ error: "Add a card first. The weekly fee is charged to it." }, { status: 400 })
  }

  // Tee time: the one asked for, or for "either" the emptier one. Full means
  // waitlisted. The database trigger league_teams_capacity is the real limit;
  // this just picks sensibly and retries if a spot went at the same moment.
  const times = (league.tee_times ?? ["17:30", "19:30"]).map(normalizeTeeTime)
  const counts = await teamsPerTeeTime(service, league.id)
  const open = (t: string) => (counts[t] ?? 0) < league.teams_per_tee_time
  let order: string[]
  if (teePick !== "either" && times.includes(teePick)) order = [teePick]
  else order = [...times].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0))

  const token = randomBytes(18).toString("base64url")
  let team: { id: string; tee_time: string; status: string } | null = null
  for (const t of order.filter(open)) {
    const { data, error } = await service.from("league_teams").insert({
      league_id: league.id, name: teamName, captain_user_id: user.id,
      partner_invite_name: partnerName, partner_invite_email: partnerEmail,
      invite_token: token, tee_time: t, status: "pending_partner",
    }).select("id, tee_time, status").single()
    if (!error && data) { team = data; break }
    if (!String(error?.message).includes("LEAGUE_TEE_TIME_FULL")) {
      await logFailure(service, "league-team-create-FAILED", `user=${user.id} err=${String(error?.message).slice(0, 200)}`)
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
    }
  }
  if (!team) {
    const { data, error } = await service.from("league_teams").insert({
      league_id: league.id, name: teamName, captain_user_id: user.id,
      partner_invite_name: partnerName, partner_invite_email: partnerEmail,
      invite_token: token, tee_time: order[0], status: "waitlisted",
    }).select("id, tee_time, status").single()
    if (error || !data) {
      await logFailure(service, "league-team-create-FAILED", `user=${user.id} waitlist err=${String(error?.message).slice(0, 200)}`)
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
    }
    team = data
  }

  if (!team) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })

  const { error: partErr } = await service.from("league_participants").insert({
    league_id: league.id, user_id: user.id, team_id: team.id, role: "captain",
    status: team.status === "waitlisted" ? "waitlisted" : "registered",
    preferred_slot: team.tee_time, partner_name: partnerName,
    charges_authorized_at: new Date().toISOString(), active: true,
  })
  if (partErr) {
    await service.from("league_teams").delete().eq("id", team.id)
    return NextResponse.json({ error: "You're already signed up for this league" }, { status: 409 })
  }

  await recordLeagueWaiver(service, user.id)

  const link = inviteUrl(token)
  if (partnerEmail && p) {
    try {
      await sendLeaguePartnerInviteEmail({
        to: partnerEmail, partnerName, captainName: `${p.first_name} ${p.last_name}`.trim(),
        teamName, teeTime: teeTimeLabel(team.tee_time), link,
      })
    } catch (e) {
      await logFailure(service, "league-invite-email-FAILED", `team=${team.id} err=${String(e).slice(0, 200)}`)
    }
  }

  await logEvent(service, "league-team-created", `team=${team.id} captain=${user.id} tee=${team.tee_time} status=${team.status}`)
  await notifyOwner(`League: ${p?.first_name ?? "Someone"} ${p?.last_name ?? ""} started team "${teamName}" (${teeTimeLabel(team.tee_time)}${team.status === "waitlisted" ? ", WAITLIST" : ""}). Waiting on partner ${partnerName}.`)

  return NextResponse.json({ ok: true, teamId: team.id, status: team.status, teeTime: team.tee_time, inviteLink: link })
}
