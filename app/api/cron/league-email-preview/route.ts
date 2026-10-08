import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  sendLeagueCaptainSignedUpEmail,
  sendLeaguePartnerInviteEmail,
  sendLeagueTeamConfirmedEmail,
} from "@/lib/league/messages"
import { logEvent } from "@/lib/observability/notify"

/**
 * Sends one sample of every league email (captain signed up, captain paying
 * for both, partner invite, team confirmed) to one admin, so the real
 * rendered output can be checked in an inbox. Sample data only; nothing is
 * created. Behind CRON_SECRET; ?to=<admin user id>.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const to = request.nextUrl.searchParams.get("to") ?? ""
  const { data: admin } = await db.from("profiles").select("first_name, role").eq("id", to).maybeSingle()
  const a = admin as { first_name: string; role: string } | null
  if (!a || a.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 400 })
  const { data: { user } } = await db.auth.admin.getUserById(to)
  if (!user?.email) return NextResponse.json({ error: "No email" }, { status: 400 })

  const sample = { teamName: "Sample Team (preview)", teeTime: "5:30pm", link: "https://tee365.org/league/join/SAMPLE" }
  await sendLeagueCaptainSignedUpEmail({ to: user.email, firstName: a.first_name, partnerName: "Pat Partner", waitlisted: false, payingForBoth: false, perWeek: 30, ...sample })
  await sendLeagueCaptainSignedUpEmail({ to: user.email, firstName: a.first_name, partnerName: "Pat Partner", waitlisted: false, payingForBoth: true, perWeek: 30, ...sample })
  await sendLeaguePartnerInviteEmail({ to: user.email, partnerName: a.first_name, captainName: "Casey Captain", teamName: sample.teamName, teeTime: sample.teeTime, link: sample.link, captainPays: true })
  await sendLeagueTeamConfirmedEmail({ to: user.email, firstName: a.first_name, teamName: sample.teamName, teeTime: sample.teeTime, teammateName: "Pat", waitlisted: false })
  await logEvent(db, "league-email-preview-sent", `to=${to}`)
  return NextResponse.json({ ok: true, sent: 4 })
}
