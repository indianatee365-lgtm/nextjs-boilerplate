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
    .select("id, user_id, bay_id, status, roster_links")
    .eq("id", bookingId)
    .single()

  // Booking may have ended between the shot happening and this POST landing
  // (capture thread and sync poll aren't perfectly synchronized) - still
  // accept the shot rather than drop it, attributed to whoever the booking
  // belonged to, as long as it's genuinely this bay's booking.
  if (!booking || booking.bay_id !== bayId) {
    return NextResponse.json({ error: "Booking does not belong to this bay" }, { status: 400 })
  }

  // Attribute to the linked account for the hitter name if one was set up
  // during roster confirmation (see who-is-up/actions.ts's confirmRoster),
  // otherwise fall back to the booking owner - covers both an unlinked
  // guest name and the common case of nobody ever touching who's-up at all.
  const rosterLinks = (booking.roster_links as Record<string, string> | null) ?? {}
  const attributedUserId = (body.hitterName && rosterLinks[body.hitterName]) || booking.user_id

  const { error } = await serviceClient.from("shots").insert({
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

  if (error) {
    return NextResponse.json({ error: "Failed to save shot" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
