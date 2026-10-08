import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { hasCardOnFile, teeTimeLabel } from "@/lib/league"
import { recordLeagueWaiver } from "@/lib/league/waiver"
import { startingNineHoleHandicap } from "@/lib/league/handicap"
import { sendLeagueTeamConfirmedSms } from "@/lib/telnyx/sms"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"

/** The partner accepts their captain's invite. That confirms the team. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to accept" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body.agreedToWaiver !== true) {
    return NextResponse.json({ error: "Agree to the waiver to continue" }, { status: 400 })
  }
  const startHcp = startingNineHoleHandicap(body.handicapBasis, body.handicapValue)
  if (!startHcp) return NextResponse.json({ error: "Enter your handicap or your typical score" }, { status: 400 })

  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: teamRow } = await service
    .from("league_teams")
    .select("id, league_id, name, captain_user_id, partner_user_id, tee_time, status, captain_pays_for_both")
    .eq("invite_token", token)
    .maybeSingle()
  const team = teamRow as {
    id: string; league_id: string; name: string; captain_user_id: string
    partner_user_id: string | null; tee_time: string; status: string; captain_pays_for_both: boolean
  } | null
  if (!team || team.status === "withdrawn") return NextResponse.json({ error: "This invite isn't valid anymore" }, { status: 404 })
  if (team.captain_user_id === user.id) return NextResponse.json({ error: "That's your own team. Send this link to your partner." }, { status: 400 })
  if (team.partner_user_id) return NextResponse.json({ error: "This team already has its partner" }, { status: 409 })

  const { data: existing } = await service
    .from("league_participants").select("id").eq("league_id", team.league_id).eq("user_id", user.id).maybeSingle()
  if (existing) return NextResponse.json({ error: "You're already signed up for this league" }, { status: 409 })

  // When the captain pays for both, the partner authorizes nothing and needs no card.
  if (!team.captain_pays_for_both) {
    if (body.authorizedCharges !== true) {
      return NextResponse.json({ error: "Agree to the weekly charge to continue" }, { status: 400 })
    }
    if (!(await hasCardOnFile(service, user.id))) {
      return NextResponse.json({ error: "Add a card first. The weekly fee is charged to it." }, { status: 400 })
    }
  }

  const confirmed = team.status === "pending_partner"
  const { data: updated, error: teamErr } = await service
    .from("league_teams")
    .update({
      partner_user_id: user.id,
      ...(confirmed ? { status: "confirmed", confirmed_at: new Date().toISOString() } : {}),
    })
    .eq("id", team.id)
    .is("partner_user_id", null)
    .select("id")
  if (teamErr || !updated || updated.length === 0) {
    return NextResponse.json({ error: "This team already has its partner" }, { status: 409 })
  }

  const { error: partErr } = await service.from("league_participants").insert({
    league_id: team.league_id, user_id: user.id, team_id: team.id, role: "partner",
    status: confirmed ? "registered" : "waitlisted", preferred_slot: team.tee_time,
    charges_authorized_at: team.captain_pays_for_both ? null : new Date().toISOString(), active: true,
    payer_user_id: team.captain_pays_for_both ? team.captain_user_id : user.id,
    starting_handicap: startHcp.nine, starting_handicap_basis: startHcp.basis, starting_handicap_input: startHcp.value,
    forward_tees: body.forwardTees === true,
  })
  if (partErr) {
    await service.from("league_teams")
      .update({ partner_user_id: null, ...(confirmed ? { status: "pending_partner", confirmed_at: null } : {}) })
      .eq("id", team.id)
    return NextResponse.json({ error: "You're already signed up for this league" }, { status: 409 })
  }

  await recordLeagueWaiver(service, user.id)

  const [{ data: captain }, { data: partner }] = await Promise.all([
    service.from("profiles").select("first_name, last_name, phone, sms_consent").eq("id", team.captain_user_id).single(),
    service.from("profiles").select("first_name, last_name").eq("id", user.id).single(),
  ])
  const c = captain as { first_name: string; last_name: string; phone: string | null; sms_consent: boolean } | null
  const pt = partner as { first_name: string; last_name: string } | null
  if (c?.phone && c.sms_consent) {
    try {
      await sendLeagueTeamConfirmedSms({
        to: c.phone, firstName: c.first_name, partnerName: pt?.first_name ?? "Your partner",
        teamName: team.name, teeTime: teeTimeLabel(team.tee_time), waitlisted: !confirmed,
      })
    } catch (e) {
      await logFailure(service, "league-team-confirmed-sms-FAILED", `team=${team.id} err=${String(e).slice(0, 200)}`)
    }
  }

  await logEvent(service, "league-partner-joined", `team=${team.id} partner=${user.id} confirmed=${confirmed}`)
  await notifyOwner(`League: ${pt?.first_name ?? "A partner"} ${pt?.last_name ?? ""} joined team "${team.name}" with ${c?.first_name ?? "their captain"}. ${confirmed ? `Confirmed, ${teeTimeLabel(team.tee_time)}.` : "Still on the WAITLIST."}`)

  return NextResponse.json({ ok: true, status: confirmed ? "confirmed" : "waitlisted" })
}
