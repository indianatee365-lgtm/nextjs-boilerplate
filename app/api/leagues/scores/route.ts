import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { confirmMatch, loadMatch } from "@/lib/league/matches"
import { logEvent, notifyOwner } from "@/lib/observability/notify"

/**
 * Score entry and confirmation for one match.
 *   action=enter    any player in the match (or an admin) saves all four cards
 *   action=confirm  a player on the OTHER team from whoever entered confirms
 *   action=dispute  a player on the other team disputes, with a note
 * An admin entering or confirming confirms straight away. Unconfirmed scores
 * confirm themselves after 12 hours (/api/cron/league-autoconfirm).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const matchId = typeof body.matchId === "string" ? body.matchId : ""
  const action = body.action
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()

  const view = await loadMatch(db, matchId)
  if (!view) return NextResponse.json({ error: "Match not found" }, { status: 404 })
  const { data: prof } = await db.from("profiles").select("role, first_name, last_name").eq("id", user.id).single()
  const isAdmin = (prof as { role: string } | null)?.role === "admin"
  const myTeamId = view.home.players.some((p) => p.userId === user.id) ? view.home.teamId
    : view.away?.players.some((p) => p.userId === user.id) ? view.away.teamId : null
  if (!myTeamId && !isAdmin) return NextResponse.json({ error: "You're not in this match" }, { status: 403 })
  if (view.week.cancelled) return NextResponse.json({ error: "This league night was cancelled" }, { status: 400 })
  const who = `${(prof as { first_name: string }).first_name} ${(prof as { last_name: string }).last_name}`.trim()

  if (action === "enter") {
    if (view.result?.status === "confirmed" && !(isAdmin && !myTeamId)) {
      return NextResponse.json({ error: "These scores are already confirmed. Ask the commissioner if something's wrong." }, { status: 409 })
    }
    const allPlayers = [...view.home.players.map((p) => ({ ...p, teamId: view.home.teamId })), ...(view.away?.players ?? []).map((p) => ({ ...p, teamId: view.away!.teamId }))]
    const cards = (body.cards ?? {}) as Record<string, unknown>
    const subs = (body.subs ?? {}) as Record<string, unknown>
    const rows = []
    for (const p of allPlayers) {
      const c = cards[p.userId]
      let strokes: number[] | null = null
      if (Array.isArray(c)) {
        const nums = c.map((v) => Number(v))
        if (nums.length !== 9 || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 15)) {
          return NextResponse.json({ error: `Check ${p.name}'s card: every hole needs a score from 1 to 15.` }, { status: 400 })
        }
        strokes = nums
      } else if (c !== null) {
        return NextResponse.json({ error: `Enter ${p.name}'s scores, or mark them absent.` }, { status: 400 })
      }
      const subName = typeof subs[p.userId] === "string" ? (subs[p.userId] as string).trim().slice(0, 60) : ""
      if (subName && !strokes) return NextResponse.json({ error: `Enter the sub's scores for ${p.name}, or mark them absent.` }, { status: 400 })
      rows.push({ match_id: matchId, team_id: p.teamId, user_id: p.userId, strokes, sub_name: subName || null, entered_by: user.id, updated_at: new Date().toISOString() })
    }
    await db.from("league_scorecards").upsert(rows, { onConflict: "match_id,user_id" })
    await db.from("league_results").upsert({
      match_id: matchId, status: "entered", entered_by: user.id, entered_team_id: myTeamId,
      entered_at: new Date().toISOString(), confirmed_by: null, confirmed_at: null, dispute_note: null,
    })
    // The commissioner's save is final, unless it's his own match: then the
    // other team still confirms, like anyone else's.
    const commissionerFinal = isAdmin && !myTeamId
    if (commissionerFinal) await confirmMatch(db, matchId, user.id)
    await logEvent(db, "league-scores-entered", `match=${matchId} by=${user.id} final=${commissionerFinal}`)
    return NextResponse.json({ ok: true, status: commissionerFinal ? "confirmed" : "entered" })
  }

  if (action === "confirm" || action === "dispute") {
    if (!view.result || view.result.status !== "entered") return NextResponse.json({ error: "Nothing to confirm" }, { status: 400 })
    if (myTeamId && myTeamId === view.result.enteredTeamId) {
      return NextResponse.json({ error: "The other team confirms your scores, not your own team." }, { status: 403 })
    }
    if (action === "confirm") {
      await confirmMatch(db, matchId, user.id)
      await logEvent(db, "league-scores-confirmed", `match=${matchId} by=${user.id}`)
      return NextResponse.json({ ok: true, status: "confirmed" })
    }
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : ""
    await db.from("league_results").update({ status: "disputed", dispute_note: note || null }).eq("match_id", matchId)
    await logEvent(db, "league-scores-disputed", `match=${matchId} by=${user.id}`)
    await notifyOwner(`League score DISPUTED, week ${view.week.weekNo}, ${view.home.name} vs ${view.away?.name ?? "bye"}, by ${who}: ${note || "no note"}. Fix it at tee365.org/league/play?match=${matchId}`)
    return NextResponse.json({ ok: true, status: "disputed" })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
