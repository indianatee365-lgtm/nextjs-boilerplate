import { addDaysToDateKey, easternDateKey } from "@/lib/time/eastern"
import { LEAGUE_SLUG, teeTimeLabel } from "@/lib/league"
import { getStandings } from "@/lib/league/standings"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"
import { sendLeaguePlayerText } from "@/lib/telnyx/sms"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * League player texts. One cron (every 15 minutes, Wed to Fri UTC) calls
 * runLeagueTexts; it reads the Eastern clock and sends whatever is due:
 *
 *   before  Wednesday 6pm: tomorrow's tee time, bay, opponent, course, door code.
 *           Held until the door code exists (lib/league/night.ts creates it
 *           in the same run); if it still doesn't by Thursday 11:45am, sent
 *           without it, and the card text carries the code instead.
 *   card    45 minutes before tee time: door code, score card link, scoring
 *   nudge   2.5 hours after tee time, only if no scores are in: please enter them
 *   recap   Friday 10am: your result, your place, next week
 *
 * Each text goes once per player per week: an admin_logs row is written
 * BEFORE sending and removed if the send fails, so a failure is retried on the
 * next run and nothing is sent twice. Windows close (the card text stops
 * 2.5 hours after tee time, "before" stops at Thursday noon), so an outage never
 * sends a stale text. Cancelled nights send nothing.
 *
 * The other team's "tap to confirm" text is sent by the scores route, the
 * moment scores are entered.
 */
export type TextKind = "before" | "card" | "nudge" | "recap"

const EVENT = "league-player-text"
const PLAY = "tee365.org/league/play"

export interface Week { id: string; week_no: number; play_date: string; kind: "learning" | "match" | "finale"; course: string; nine: string; cancelled: boolean }
export interface Player { userId: string; firstName: string; phone: string | null; sms: boolean }
export interface Side { teamId: string; name: string; players: Player[] }
export interface Match { id: string; teeTime: string; bay: number | null; home: Side; away: Side | null; week: Week; result: { status: string; home: number | null; away: number | null } | null; doorPin: string | null }

export interface Planned { kind: TextKind; userId: string; to: string | null; weekId: string; body: string }

const SIGN = "\n- jerrod"
const dayLabel = (key: string) =>
  new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" })
const names = (s: Side) => s.players.map((p) => p.firstName).join(" & ")
const nineLabel = (n: string) => (n ? `, ${n} nine` : "")
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function format(week: Week): string {
  if (week.kind === "learning") return "Learning week: your team's combined net score vs theirs, 4 points to the lower."
  if (week.kind === "finale") return "Final night: A vs A and B vs B, hole by hole, plus 2 for the lower team total."
  return "A vs A and B vs B, net, hole by hole, plus 2 for the lower team total."
}

const doorLine = (pin: string | null) => (pin ? `Door code: ${pin} (works 5:00 to 9:45pm that night only).` : "Your door code will come by text before you arrive.")

export function beforeText(m: Match, side: "home" | "away", firstName: string, sameDay = false): string {
  const me = side === "home" ? m.home : m.away!
  const them = side === "home" ? m.away : m.home
  const when = sameDay ? "tonight" : "tomorrow"
  if (!them) {
    return `Hi ${firstName}, no match for ${me.name} ${when} (${dayLabel(m.week.play_date)}): you have a bye this week, worth half the points on offer. See you the week after.${SIGN}`
  }
  return `Hi ${firstName}, league ${when} (${dayLabel(m.week.play_date)}): ${teeTimeLabel(m.teeTime)}${m.bay ? `, Bay ${m.bay}` : ""}. ${me.name} vs ${them.name} (${names(them)}). Course: ${m.week.course}${nineLabel(m.week.nine)}. ${format(m.week)} Please arrive 15 minutes early. ${doorLine(m.doorPin)} Score card: ${PLAY}${SIGN}`
}

export function cardText(m: Match, firstName: string): string {
  return `Hi ${firstName}, ${m.doorPin ? `door code tonight: ${m.doorPin}. ` : ""}Score card for ${m.home.name} vs ${m.away!.name}: ${PLAY}\nMax on any hole is net double bogey, shown under each box: pick up when you hit it. When you finish, one player enters all four cards and the other team confirms. Good luck!${SIGN}`
}

export function nudgeText(m: Match, firstName: string): string {
  return `Hi ${firstName}, scores for ${m.home.name} vs ${m.away!.name} aren't in yet. One player, please enter all four cards before you leave: ${PLAY}${SIGN}`
}

export function recapText(m: Match, side: "home" | "away", firstName: string, place: { rank: number; of: number; points: number; tied: boolean } | null, next: Week | null): string {
  const me = side === "home" ? m.home : m.away!
  const them = side === "home" ? m.away : m.home
  let result: string
  if (!them) result = `Bye week for ${me.name}.`
  else if (m.result?.status === "confirmed" && m.result.home !== null && m.result.away !== null) {
    const mine = side === "home" ? m.result.home : m.result.away
    const theirs = side === "home" ? m.result.away : m.result.home
    result = `${me.name} ${fmt(mine)}, ${them.name} ${fmt(theirs)}.`
  } else result = `Your result vs ${them.name} isn't final yet${m.result?.status === "disputed" ? " (the commissioner is checking it)" : ""}.`
  const standing = place ? ` ${me.name} is ${place.tied ? "tied for " : ""}${ordinal(place.rank)} of ${place.of} with ${fmt(place.points)} points.` : ""
  const upNext = next ? `Next: ${dayLabel(next.play_date)}, ${next.course}${nineLabel(next.nine)}.` : "That was the last night of the season. Thanks for playing!"
  return `Hi ${firstName}, week ${m.week.week_no} results: ${result}${standing} ${upNext}
Standings: tee365.org/league/standings${SIGN}`
}

/** Eastern date key and minutes past midnight. */
export function easternClock(now: Date): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return { day: easternDateKey(now), minutes: h * 60 + mi }
}

const teeMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Which kinds are due for this match right now (before dedupe). Pure, for testing. */
export function dueKinds(m: Match, now: Date): TextKind[] {
  if (m.week.cancelled) return []
  const { day, minutes } = easternClock(now)
  const tee = teeMinutes(m.teeTime)
  const out: TextKind[] = []
  if ((m.week.play_date === addDaysToDateKey(day, 1) && minutes >= 18 * 60) || (m.week.play_date === day && minutes < 12 * 60)) out.push("before")
  if (m.week.play_date === day && m.away) {
    if (minutes >= tee - 45 && minutes < tee + 150) out.push("card")
    if (minutes >= tee + 150 && !m.result) out.push("nudge")
  }
  if (m.week.play_date === addDaysToDateKey(day, -1) && minutes >= 10 * 60 && minutes < 20 * 60) out.push("recap")
  return out
}

async function loadMatches(db: SupabaseClient, leagueId: string, days: string[]): Promise<{ matches: Match[]; weeks: Week[] }> {
  const { data: allWeeks } = await db.from("league_weeks").select("id, week_no, play_date, kind, course, nine, cancelled").eq("league_id", leagueId).order("week_no")
  const weeks = (allWeeks ?? []) as Week[]
  const wanted = weeks.filter((w) => days.includes(w.play_date))
  if (!wanted.length) return { matches: [], weeks }
  const { data: rows } = await db.from("league_matches")
    .select("id, week_id, tee_time, bay_number, home_team_id, away_team_id, league_results(status, home_points, away_points)")
    .in("week_id", wanted.map((w) => w.id))
  const { data: nights } = await db.from("league_nights").select("week_id, door_pin, door_revoked_at").in("week_id", wanted.map((w) => w.id))
  const pinFor = (weekId: string) => {
    const n = ((nights ?? []) as { week_id: string; door_pin: string | null; door_revoked_at: string | null }[]).find((x) => x.week_id === weekId)
    return n && !n.door_revoked_at ? n.door_pin : null
  }
  const ms = (rows ?? []) as { id: string; week_id: string; tee_time: string; bay_number: number | null; home_team_id: string; away_team_id: string | null; league_results: unknown }[]
  const teamIds = [...new Set(ms.flatMap((m) => [m.home_team_id, m.away_team_id].filter(Boolean) as string[]))]
  const [{ data: teams }, { data: parts }] = await Promise.all([
    db.from("league_teams").select("id, name").in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]),
    db.from("league_participants").select("team_id, user_id, profiles!league_participants_user_id_fkey(first_name, phone, sms_consent)")
      .eq("league_id", leagueId).in("team_id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]),
  ])
  const side = (id: string): Side => ({
    teamId: id,
    name: ((teams ?? []) as { id: string; name: string }[]).find((t) => t.id === id)?.name ?? "Team",
    players: ((parts ?? []) as { team_id: string; user_id: string; profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null }[])
      .filter((p) => p.team_id === id)
      .map((p) => ({ userId: p.user_id, firstName: p.profiles?.first_name ?? "there", phone: p.profiles?.phone ?? null, sms: Boolean(p.profiles?.phone && p.profiles.sms_consent) })),
  })
  const matches = ms.map((m) => {
    const r = Array.isArray(m.league_results) ? m.league_results[0] : m.league_results
    const res = r as { status: string; home_points: number | null; away_points: number | null } | null | undefined
    return {
      id: m.id, teeTime: m.tee_time, bay: m.bay_number,
      home: side(m.home_team_id), away: m.away_team_id ? side(m.away_team_id) : null,
      week: wanted.find((w) => w.id === m.week_id)!,
      doorPin: pinFor(m.week_id),
      result: res ? { status: res.status, home: res.home_points === null ? null : Number(res.home_points), away: res.away_points === null ? null : Number(res.away_points) } : null,
    }
  })
  return { matches, weeks }
}

/** Everything due right now, minus what was already sent. */
export async function planLeagueTexts(db: SupabaseClient, now: Date): Promise<Planned[]> {
  const { data: league } = await db.from("leagues").select("id, active").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; active: boolean } | null
  if (!l?.active) return []
  const { day, minutes } = easternClock(now)
  const { matches, weeks } = await loadMatches(db, l.id, [addDaysToDateKey(day, -1), day, addDaysToDateKey(day, 1)])
  if (!matches.length) return []

  // Marks for these weeks are at most a few days old; a week's texts span Wednesday to Friday.
  const { data: sentRows } = await db.from("admin_logs").select("detail").eq("event", EVENT)
    .gte("created_at", new Date(now.getTime() - 5 * 86400 * 1000).toISOString()).limit(5000)
  const sent = new Set(((sentRows ?? []) as { detail: string }[]).map((r) => r.detail))

  let places: Map<string, { rank: number; of: number; points: number; tied: boolean }> | null = null
  const out: Planned[] = []
  for (const m of matches) {
    for (const kind of dueKinds(m, now)) {
      const sameDay = m.week.play_date === day
      if (kind === "before" && !m.doorPin && m.away && !(sameDay && minutes >= 11 * 60 + 45)) continue
      if (kind === "recap" && !places) {
        const { rows } = await getStandings(db)
        places = new Map(rows.map((r) => [r.teamId, { rank: 1 + rows.filter((o) => o.points > r.points).length, of: rows.length, points: r.points, tied: rows.filter((o) => o.points === r.points).length > 1 }]))
      }
      const next = weeks.find((w) => w.week_no > m.week.week_no && !w.cancelled) ?? null
      for (const sideKey of ["home", "away"] as const) {
        const s = sideKey === "home" ? m.home : m.away
        if (!s) continue
        if ((kind === "card" || kind === "nudge") && !m.away) continue
        for (const p of s.players) {
          if (sent.has(markOf(kind, m.week.id, p.userId))) continue
          const body = kind === "before" ? beforeText(m, sideKey, p.firstName, sameDay)
            : kind === "card" ? cardText(m, p.firstName)
            : kind === "nudge" ? nudgeText(m, p.firstName)
            : recapText(m, sideKey, p.firstName, places?.get(s.teamId) ?? null, next)
          out.push({ kind, userId: p.userId, to: p.sms ? p.phone : null, weekId: m.week.id, body })
        }
      }
    }
  }
  return out
}

const markOf = (kind: TextKind, weekId: string, userId: string) => `k=${kind} w=${weekId} u=${userId}`

export async function runLeagueTexts(db: SupabaseClient, now: Date): Promise<{ sent: number; failed: number; noPhone: number; byKind: Record<string, number> }> {
  const plan = await planLeagueTexts(db, now)
  let sent = 0, failed = 0, noPhone = 0
  const byKind: Record<string, number> = {}
  for (const t of plan) {
    const mark = markOf(t.kind, t.weekId, t.userId)
    // Marked even without a phone, so a player without SMS isn't re-planned every 15 minutes.
    await logEvent(db, EVENT, mark)
    if (!t.to) { noPhone++; continue }
    try {
      await sendLeaguePlayerText({ to: t.to, body: t.body, kind: `league-${t.kind}` })
      sent++
      byKind[t.kind] = (byKind[t.kind] ?? 0) + 1
    } catch (e) {
      failed++
      await db.from("admin_logs").delete().eq("event", EVENT).eq("detail", mark)
      await logFailure(db, "league-player-text-FAILED", `${mark} err=${String(e).slice(0, 200)}`)
    }
  }
  if (sent || failed) {
    const kinds = Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(", ")
    await notifyOwner(`League texts: ${sent} sent${kinds ? ` (${kinds})` : ""}${failed ? `, ${failed} FAILED (retrying in 15 min)` : ""}${noPhone ? `, ${noPhone} players have no SMS` : ""}.`)
  }
  return { sent, failed, noPhone, byKind }
}

/** "Tap to confirm" text to the team that didn't enter. Called by the scores route. */
export async function sendConfirmRequest(db: SupabaseClient, matchId: string, enteredTeamId: string, enteredByName: string): Promise<void> {
  const { data: m } = await db.from("league_matches").select("home_team_id, away_team_id").eq("id", matchId).single()
  const row = m as { home_team_id: string; away_team_id: string | null } | null
  if (!row?.away_team_id) return
  const otherId = row.home_team_id === enteredTeamId ? row.away_team_id : row.home_team_id
  const { data: teams } = await db.from("league_teams").select("id, name").in("id", [row.home_team_id, row.away_team_id])
  const name = (id: string) => ((teams ?? []) as { id: string; name: string }[]).find((t) => t.id === id)?.name ?? "your opponent"
  const { data: parts } = await db.from("league_participants").select("user_id, profiles!league_participants_user_id_fkey(first_name, phone, sms_consent)").eq("team_id", otherId)
  for (const p of (parts ?? []) as { user_id: string; profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null }[]) {
    if (!p.profiles?.phone || !p.profiles.sms_consent) continue
    const body = `Hi ${p.profiles.first_name}, ${enteredByName} (${name(enteredTeamId)}) entered the scores for your match tonight. Check them and tap Confirm, or "Something's wrong" if anything is off: ${PLAY}?match=${matchId}\nIf nobody checks, they confirm on their own in 12 hours.${SIGN}`
    try {
      await sendLeaguePlayerText({ to: p.profiles.phone, body, kind: "league-confirm-request" })
    } catch (e) {
      await logFailure(db, "league-confirm-request-FAILED", `match=${matchId} user=${p.user_id} err=${String(e).slice(0, 200)}`)
    }
  }
}
