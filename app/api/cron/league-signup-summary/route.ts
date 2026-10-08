import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, teeTimeLabel } from "@/lib/league"
import { logEvent, notifyOwner } from "@/lib/observability/notify"

/**
 * Signup close-out summary, texted to Jerrod (scheduled by pg_cron for the
 * morning after signups close). Lists what is decided and what needs one
 * click, so nothing on Oct 20/21 is a judgement call:
 *   teams per tee time, odd counts with the suggested move, teams still
 *   waiting on a partner, the waitlist, and the next step (generate the
 *   schedule on /admin/league).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: league } = await db.from("leagues").select("id, tee_times, teams_per_tee_time").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; tee_times: string[]; teams_per_tee_time: number }
  const { data: teams } = await db.from("league_teams").select("name, tee_time, status, partner_invite_name").eq("league_id", l.id)
  const rows = (teams ?? []) as { name: string; tee_time: string; status: string; partner_invite_name: string | null }[]
  const times = (l.tee_times ?? []).map((t) => t.slice(0, 5))
  const confirmed = (t: string) => rows.filter((r) => r.status === "confirmed" && r.tee_time.slice(0, 5) === t).length
  const counts = times.map((t) => ({ t, n: confirmed(t) }))
  const pending = rows.filter((r) => r.status === "pending_partner")
  const waitlist = rows.filter((r) => r.status === "waitlisted")
  const odd = counts.filter((c) => c.n % 2 === 1)

  const lines = [
    `League signups closed. Confirmed: ${counts.map((c) => `${teeTimeLabel(c.t)} ${c.n}`).join(", ")} (of ${l.teams_per_tee_time} each).`,
  ]
  if (odd.length === 2) lines.push(`Both tee times are odd: move one team between them (Move button on /admin/league) and there are no byes.`)
  else if (odd.length === 1) lines.push(`${teeTimeLabel(odd[0].t)} is odd: one bye a week (half points, already in the rules), or add a waitlisted team to make it even.`)
  else lines.push("Both tee times are even, no byes.")
  if (pending.length) lines.push(`Still waiting on a partner: ${pending.map((p) => `${p.name} (${p.partner_invite_name ?? "?"})`).join("; ")}. These are NOT charged or scheduled unless they confirm.`)
  if (waitlist.length) lines.push(`Waitlist: ${waitlist.map((w) => w.name).join(", ")}.`)
  lines.push("Next: Generate schedule on /admin/league before Thursday.")

  const text = lines.join(" ")
  await notifyOwner(text)
  await logEvent(db, "league-signup-summary-sent", text.slice(0, 400))
  return NextResponse.json({ sent: true, text })
}
