import { addDaysToDateKey, easternMidnightUtc } from "@/lib/time/eastern"
import { LEAGUE_SLUG } from "@/lib/league"
import { easternClock } from "@/lib/league/texts"
import { grantBayAccess, revokeBayAccess } from "@/lib/access-control"
import { DOOR_OPENS_EARLY_MINUTES } from "@/lib/access-control/constants"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * League night operations, run by the league-texts cron (every 15 minutes,
 * Wed to Fri UTC) BEFORE the texts, on the Eastern clock:
 *
 *   door  Wednesday 6pm: one door code for the night, working Thursday 5:00
 *         to 9:45pm only. It goes out in the night-before and score card
 *         texts, and Jerrod gets it by text. Deleted at 9:45pm: the door
 *         controller repeats schedules weekly, so a code that isn't deleted
 *         would open the door every Thursday forever. Retried every run
 *         until it's gone, and a cancelled night deletes it straight away.
 *   bays  5:15pm: every bay with no override (maintenance stays untouched)
 *         is switched to "occupied", which loads the simulator exactly like
 *         a booking pre-warm. 9:30pm: only the bays this turned on go back.
 *
 * State lives in league_nights (service role only, the PIN is a secret).
 */
const DOOR_OPEN = 17 * 60          // 5:00pm, the code starts working
const DOOR_CLOSE = 21 * 60 + 45    // 9:45pm, the code stops and is deleted
const BAYS_ON = 17 * 60 + 15       // 5:15pm
const BAYS_OFF = 21 * 60 + 30      // 9:30pm

interface Night {
  week_id: string
  door_pin: string | null
  door_user_id: string | null
  door_policy_id: string | null
  door_schedule_id: string | null
  door_granted_at: string | null
  door_revoked_at: string | null
  door_error: string | null
  bays_turned_on: string[]
  bays_on_at: string | null
  bays_off_at: string | null
}

export type NightStep = "grant-door" | "revoke-door" | "bays-on" | "bays-off"

/** Which steps are due for one league week right now. Pure, for testing. */
export function dueNightSteps(
  week: { play_date: string; cancelled: boolean },
  night: Pick<Night, "door_user_id" | "door_pin" | "door_revoked_at" | "bays_on_at" | "bays_off_at"> | null,
  now: Date,
): NightStep[] {
  const { day, minutes } = easternClock(now)
  const tonight = week.play_date === day
  const tomorrow = week.play_date === addDaysToDateKey(day, 1)
  const past = week.play_date < day
  const granted = Boolean(night?.door_user_id || night?.door_pin)
  const revoked = Boolean(night?.door_revoked_at)
  const out: NightStep[] = []

  if (granted && !revoked && (week.cancelled || past || (tonight && minutes >= DOOR_CLOSE))) out.push("revoke-door")
  else if (!week.cancelled && !granted && ((tomorrow && minutes >= 18 * 60) || (tonight && minutes < DOOR_CLOSE))) out.push("grant-door")

  if (night?.bays_on_at && !night.bays_off_at && (week.cancelled || past || (tonight && minutes >= BAYS_OFF))) out.push("bays-off")
  else if (!week.cancelled && tonight && !night?.bays_on_at && minutes >= BAYS_ON && minutes < BAYS_OFF) out.push("bays-on")
  return out
}

const at = (dateKey: string, minutes: number) => new Date(easternMidnightUtc(dateKey).getTime() + minutes * 60000)
const dayLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" })

export async function runLeagueNight(db: SupabaseClient, now: Date, opts: { dry?: boolean } = {}): Promise<{ steps: string[] }> {
  const { data: league } = await db.from("leagues").select("id, active").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; active: boolean } | null
  if (!l?.active) return { steps: [] }
  const { day } = easternClock(now)
  // Yesterday is included so a code that failed to delete on the night keeps being retried.
  const { data: weeks } = await db.from("league_weeks").select("id, week_no, play_date, cancelled").eq("league_id", l.id)
    .gte("play_date", addDaysToDateKey(day, -7)).lte("play_date", addDaysToDateKey(day, 1))
  const steps: string[] = []

  for (const w of (weeks ?? []) as { id: string; week_no: number; play_date: string; cancelled: boolean }[]) {
    const { data: row } = await db.from("league_nights").select("*").eq("week_id", w.id).maybeSingle()
    const night = row as Night | null
    for (const step of dueNightSteps(w, night, now)) {
      steps.push(`${step} week ${w.week_no}`)
      if (opts.dry) continue
      try {
        if (step === "grant-door") await grantDoor(db, w, night)
        if (step === "revoke-door") await revokeDoor(db, w, night!)
        if (step === "bays-on") await baysOn(db, w)
        if (step === "bays-off") await baysOff(db, w, night!)
      } catch (e) {
        await logFailure(db, `league-night-${step}-FAILED`, `week=${w.week_no} err=${String(e).slice(0, 300)}`)
      }
    }
  }
  return { steps }
}

async function grantDoor(db: SupabaseClient, w: { id: string; week_no: number; play_date: string }, night: Night | null) {
  try {
    // grantBayAccess opens the door DOOR_OPENS_EARLY_MINUTES before startsAt.
    const res = await grantBayAccess({
      bookingId: `league-week-${w.week_no}-${w.play_date}`,
      firstName: "League",
      lastName: `Night ${w.play_date}`,
      phone: "",
      bayName: "League",
      startsAt: at(w.play_date, DOOR_OPEN + DOOR_OPENS_EARLY_MINUTES),
      endsAt: at(w.play_date, DOOR_CLOSE),
    })
    await db.from("league_nights").upsert({
      week_id: w.id, door_pin: res.pinCode, door_user_id: res.userId, door_policy_id: res.accessPolicyId,
      door_schedule_id: res.scheduleId, door_granted_at: new Date().toISOString(), door_error: null, updated_at: new Date().toISOString(),
    })
    await logEvent(db, "league-night-door-granted", `week=${w.week_no} user=${res.userId}`)
    await notifyOwner(`League door code for ${dayLabel(w.play_date)}: ${res.pinCode}. Works 5:00 to 9:45pm that night only, then it's deleted. Players get it in their texts.`)
  } catch (e) {
    const first = !night?.door_error
    await db.from("league_nights").upsert({ week_id: w.id, door_error: String(e).slice(0, 300), updated_at: new Date().toISOString() })
    // Text once, not every 15 minutes; it keeps retrying either way.
    if (first) await notifyOwner(`League door code for ${dayLabel(w.play_date)} could NOT be created (UniFi error). Retrying every 15 minutes. Players' texts are held until noon Thursday.`)
    throw e
  }
}

async function revokeDoor(db: SupabaseClient, w: { id: string; week_no: number; play_date: string }, night: Night) {
  try {
    if (night.door_user_id) await revokeBayAccess(night.door_user_id, night.door_policy_id, night.door_schedule_id)
    await db.from("league_nights").update({ door_revoked_at: new Date().toISOString(), door_error: null, updated_at: new Date().toISOString() }).eq("week_id", w.id)
    await logEvent(db, "league-night-door-revoked", `week=${w.week_no} user=${night.door_user_id}`)
  } catch (e) {
    const first = !night.door_error
    await db.from("league_nights").update({ door_error: String(e).slice(0, 300), updated_at: new Date().toISOString() }).eq("week_id", w.id)
    if (first) await notifyOwner(`League door code for ${dayLabel(w.play_date)} could NOT be deleted. It would keep working every Thursday 5:00 to 9:45pm. Retrying every 15 minutes; delete user "League Night ${w.play_date}" in UniFi if this repeats.`)
    throw e
  }
}

async function baysOn(db: SupabaseClient, w: { id: string; week_no: number }) {
  const { data: bays } = await db.from("bays").select("id, name").eq("active", true)
  const { data: statuses } = await db.from("bay_agent_status").select("bay_id, override_state")
  const override = new Map(((statuses ?? []) as { bay_id: string; override_state: string | null }[]).map((s) => [s.bay_id, s.override_state]))
  const on: string[] = [], skipped: string[] = []
  for (const b of (bays ?? []) as { id: string; name: string }[]) {
    // Never override a bay someone put in maintenance (or anything else) by hand.
    if (override.get(b.id)) { skipped.push(`${b.name} (${override.get(b.id)})`); continue }
    const { data: done } = await db.from("bay_agent_status").update({ override_state: "occupied" }).eq("bay_id", b.id).is("override_state", null).select("bay_id")
    if ((done ?? []).length) on.push(b.id)
    else skipped.push(b.name)
  }
  await db.from("league_nights").upsert({ week_id: w.id, bays_turned_on: on, bays_on_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  await logEvent(db, "league-night-bays-on", `week=${w.week_no} on=${on.length} skipped=${skipped.join(",")}`)
  await notifyOwner(`League night: ${on.length} bays starting up now.${skipped.length ? ` NOT started: ${skipped.join(", ")}.` : ""}`)
}

async function baysOff(db: SupabaseClient, w: { id: string; week_no: number }, night: Night) {
  // Only the bays this turned on, and only if they're still on our override.
  if (night.bays_turned_on.length) {
    await db.from("bay_agent_status").update({ override_state: null }).in("bay_id", night.bays_turned_on).eq("override_state", "occupied")
  }
  await db.from("league_nights").update({ bays_off_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("week_id", w.id)
  await logEvent(db, "league-night-bays-off", `week=${w.week_no} bays=${night.bays_turned_on.length}`)
}
