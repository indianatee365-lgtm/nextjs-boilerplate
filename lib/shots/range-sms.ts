import type { SupabaseClient } from "@supabase/supabase-js"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { sendRangeShotsSms } from "@/lib/telnyx/sms"

// After-session text pointing range customers at My Shots (Jerrod 2026-11-19:
// only about 40 people opened My Shots in the first 12 weeks; most customers
// don't know their shots are saved).
//
// Rules:
// - A shot is a range shot when the bay filled in its club or total distance.
//   The bays only get those from GSPro's driving range data, never on a course.
// - A person qualifies when they hit at least MIN_RANGE_SHOTS range shots in
//   the session AND range shots are more than half of their shots there.
// - Sent every qualifying session until they open My Shots once
//   (profiles.shots_page_viewed_at), then never again.
// - Phone + sms_consent required; sendSms also honors STOP opt-outs.
// - admin_settings.range_shots_sms OFF (the default) = admins only, for testing.
export const RANGE_SMS_SETTING = "range_shots_sms"
const DELAY_MINUTES = 15
const LOOKBACK_MINUTES = 180
const MIN_RANGE_SHOTS = 10

const CLUB_LABELS: Record<string, string> = {
  DR: "driver", PW: "pitching wedge", GW: "gap wedge", SW: "sand wedge", LW: "lob wedge",
}
function clubLabel(code: string | null): string | null {
  if (!code || code === "PT") return null
  if (CLUB_LABELS[code]) return CLUB_LABELS[code]
  const m = /^([WIH])(\d+)$/.exec(code)
  if (!m) return null
  return `${m[2]} ${m[1] === "W" ? "wood" : m[1] === "I" ? "iron" : "hybrid"}`
}

type ShotRow = { user_id: string | null; club: string | null; total_distance_yards: number | null; carry_yards: number | null }
type Profile = { id: string; first_name: string | null; phone: string | null; sms_consent: boolean; role: string | null; shots_page_viewed_at: string | null }

export async function sendRangeShotTexts(supabase: SupabaseClient, now = new Date()) {
  const { data: setting } = await supabase.from("admin_settings").select("value").eq("key", RANGE_SMS_SETTING).maybeSingle()
  const live = setting?.value === true

  const latestEnd = new Date(now.getTime() - DELAY_MINUTES * 60_000).toISOString()
  const earliestEnd = new Date(now.getTime() - LOOKBACK_MINUTES * 60_000).toISOString()
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("parent_booking_id", null)
    .is("shots_sms_sent_at", null)
    .gte("ends_at", earliestEnd)
    .lte("ends_at", latestEnd)
  if (error) throw error

  const results: { booking: string; sentTo: string[] }[] = []
  for (const b of (bookings ?? []) as { id: string }[]) {
    // Claim the booking first so overlapping cron runs can never double-text.
    const { data: claimed } = await supabase
      .from("bookings").update({ shots_sms_sent_at: now.toISOString() })
      .eq("id", b.id).is("shots_sms_sent_at", null).select("id")
    if (!claimed?.length) continue

    // Two-bay bookings: the second bay is a child booking with its own shots.
    const { data: kids } = await supabase.from("bookings").select("id").eq("parent_booking_id", b.id)
    const ids = [b.id, ...((kids ?? []) as { id: string }[]).map((k) => k.id)]
    const { data: shots } = await supabase
      .from("shots").select("user_id, club, total_distance_yards, carry_yards").in("booking_id", ids)

    const byUser = new Map<string, ShotRow[]>()
    for (const s of (shots ?? []) as ShotRow[]) {
      if (!s.user_id) continue
      byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
    }

    const sentTo: string[] = []
    for (const [userId, rows] of byUser) {
      const range = rows.filter((s) => s.club != null || s.total_distance_yards != null)
      if (range.length < MIN_RANGE_SHOTS || range.length * 2 <= rows.length) continue

      const { data: p } = await supabase
        .from("profiles").select("id, first_name, phone, sms_consent, role, shots_page_viewed_at")
        .eq("id", userId).maybeSingle()
      const profile = p as Profile | null
      if (!profile?.phone || !profile.sms_consent || profile.shots_page_viewed_at) continue
      if (!live && profile.role !== "admin") continue

      let longest: { yds: number; club: string } | null = null
      for (const s of range) {
        const club = clubLabel(s.club)
        const yds = Number(s.total_distance_yards ?? s.carry_yards ?? 0)
        if (club && yds > 0 && (!longest || yds > longest.yds)) longest = { yds: Math.round(yds), club }
      }

      try {
        await sendRangeShotsSms({ to: profile.phone, firstName: profile.first_name || "there", rangeShots: range.length, longest })
        sentTo.push(userId)
        await logEvent(supabase, "range-shots-sms-sent", `booking=${b.id} user=${userId} shots=${range.length}${live ? "" : " (test mode)"}`)
      } catch (e) {
        await logFailure(supabase, "range-shots-sms-FAILED", `booking=${b.id} user=${userId} err=${String(e).slice(0, 200)}`)
      }
    }
    results.push({ booking: b.id, sentTo })
  }
  return { live, checked: results.length, sent: results.reduce((n, r) => n + r.sentTo.length, 0) }
}
