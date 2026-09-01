import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

// Called by companion.py's shot-capture thread (tails GSPro's ConnectDebug.txt,
// see docs/bay-agent.md) once per real shot - a real ball-data message with a
// non-heartbeat payload, optionally paired with a follow-up club-data message
// for the same shot number. Auth is the bay's own agent_token, same as
// /api/bay-agent/sync - this is bay-to-server reporting, not a customer
// request, so no separate customer auth is needed.
interface ShotRequestBody {
  bayId?: string
  token?: string
  bookingId?: string
  hitterName?: string | null
  shotNumber?: number | null
  club?: string | null
  ballSpeedMph?: number | null
  clubSpeedMph?: number | null
  carryYards?: number | null
  totalSpin?: number | null
  backSpin?: number | null
  sideSpin?: number | null
  hla?: number | null
  vla?: number | null
  path?: number | null
  angleOfAttack?: number | null
  faceToTarget?: number | null
  deviceId?: string | null
  source?: string
  raw?: Record<string, unknown> | null
}

export async function POST(request: NextRequest) {
  let body: ShotRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { bayId, token, bookingId } = body
  if (!bayId || !token || !bookingId) {
    return NextResponse.json({ error: "Missing bayId, token, or bookingId" }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { data: bay } = await serviceClient
    .from("bays")
    .select("id, agent_token")
    .eq("id", bayId)
    .single()

  if (!bay || !bay.agent_token || bay.agent_token !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, bay_id, status, roster_links, roster_names")
    .eq("id", bookingId)
    .single()

  // Booking may have ended between the shot happening and this POST landing
  // (capture thread and sync poll aren't perfectly synchronized) - still
  // accept the shot rather than drop it, attributed to whoever the booking
  // belonged to, as long as it's genuinely this bay's booking.
  if (!booking || booking.bay_id !== bayId) {
    return NextResponse.json({ error: "Booking does not belong to this bay" }, { status: 400 })
  }

  // Jerrod's call 2026-09-01: a named hitter with no linked Tee365 account
  // must never have their shots folded into the booker's own "My Shots" -
  // drop the shot entirely rather than misattribute it. Three cases:
  //   - no hitterName at all -> nobody ever touched who's-up, solo by
  //     default, always the booker.
  //   - hitterName has a roster_links entry -> explicitly linked, whether
  //     that's a guest whose email matched an account or the booker's own
  //     slot (confirmRoster links player 0 to booking.user_id as of this
  //     same date, see actions.ts).
  //   - hitterName matches roster_names[0] but isn't in roster_links -> a
  //     booking confirmed before that confirmRoster change went out; still
  //     the booker, not a guest, so still attributed rather than dropped.
  //   - anything else -> a named guest with no account link. Dropped.
  const rosterLinks = (booking.roster_links as Record<string, string> | null) ?? {}
  const rosterNames = (booking.roster_names as string[] | null) ?? []
  const hitterName = body.hitterName ?? null

  let attributedUserId: string | null
  if (!hitterName) {
    attributedUserId = booking.user_id
  } else if (rosterLinks[hitterName]) {
    attributedUserId = rosterLinks[hitterName]
  } else if (hitterName === rosterNames[0]) {
    attributedUserId = booking.user_id
  } else {
    attributedUserId = null
  }

  if (!attributedUserId) {
    return NextResponse.json({ ok: true, dropped: true })
  }

  const { data: inserted, error } = await serviceClient
    .from("shots")
    .insert({
      booking_id: booking.id,
      bay_id: bayId,
      user_id: attributedUserId,
      hitter_name: body.hitterName ?? null,
      shot_number: body.shotNumber ?? null,
      club: body.club ?? null,
      ball_speed_mph: body.ballSpeedMph ?? null,
      club_speed_mph: body.clubSpeedMph ?? null,
      carry_yards: body.carryYards ?? null,
      total_spin: body.totalSpin ?? null,
      back_spin: body.backSpin ?? null,
      side_spin: body.sideSpin ?? null,
      hla: body.hla ?? null,
      vla: body.vla ?? null,
      path: body.path ?? null,
      angle_of_attack: body.angleOfAttack ?? null,
      face_to_target: body.faceToTarget ?? null,
      device_id: body.deviceId ?? null,
      source: body.source ?? "connect_debug",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: (body.raw ?? null) as any,
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: "Failed to save shot" }, { status: 500 })
  }

  // id is returned so the capture thread can PATCH the club name in a few
  // seconds later (see PATCH below) - GSPro.db's DrivingRangeShot table,
  // the only source with a real club name, lags ConnectDebug.txt's own
  // ball/club data by several seconds (confirmed live 2026-08-24: posting
  // immediately, which is required for the real-time "no refresh" UI, means
  // the club name genuinely isn't written yet at insert time).
  return NextResponse.json({ ok: true, id: inserted?.id })
}

// Best-effort follow-up: fills in a club name and/or total distance
// discovered after the fact (both come from the same delayed GSPro.db
// lookup - see companion.py's _check_pending_club_patches). Same bay-level
// auth as POST above, additionally scoped to bay_id on the update itself so
// one bay's agent can never patch another bay's shot.
export async function PATCH(request: NextRequest) {
  let body: {
    bayId?: string
    token?: string
    shotId?: string
    club?: string
    totalDistanceYards?: number
    carryYards?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { bayId, token, shotId, club, totalDistanceYards, carryYards } = body
  if (!bayId || !token || !shotId || (!club && totalDistanceYards == null && carryYards == null)) {
    return NextResponse.json({ error: "Missing bayId, token, shotId, or an update value" }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { data: bay } = await serviceClient
    .from("bays")
    .select("id, agent_token")
    .eq("id", bayId)
    .single()

  if (!bay || !bay.agent_token || bay.agent_token !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // carryYards here is GSPro's own in-game-adjusted carry (see companion.py's
  // _lookup_recent_range_data), overwriting the raw launch-monitor value the
  // initial POST had to use since it's all that's available immediately.
  const updates: { club?: string; total_distance_yards?: number; carry_yards?: number } = {}
  if (club) updates.club = club
  if (totalDistanceYards != null) updates.total_distance_yards = totalDistanceYards
  if (carryYards != null) updates.carry_yards = carryYards

  const { error } = await serviceClient
    .from("shots")
    .update(updates)
    .eq("id", shotId)
    .eq("bay_id", bayId)

  if (error) {
    return NextResponse.json({ error: "Failed to update shot" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
