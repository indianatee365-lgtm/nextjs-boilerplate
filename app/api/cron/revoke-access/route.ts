import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { revokeBayAccess } from "@/lib/access-control"
import { logEvent, logFailure } from "@/lib/observability/notify"

export const runtime = "nodejs"

// revokeBayAccess() has existed since the original UniFi integration but was
// never actually wired up anywhere - see the 2026-09-08 migration for the
// live incident that surfaced this. Runs frequently (every 15 min, see
// vercel.json) and re-queries live data each time, so it naturally picks up
// reschedules/extensions (a booking that got pushed out just has a later
// ends_at next time this runs) and cancellations (falls into the OR branch
// below) without needing every cancellation code path to remember to call
// revoke itself.
//
// Overstay grace: never revoke before ends_at + 75 minutes for a still-
// confirmed booking - policy (see CLAUDE.md) is a 15-min grace period, then
// up to one full additional hour at the booked rate, and someone in that
// legitimate (if being charged) overstay window should never lose door
// access. Cancelled bookings have no such grace - the session isn't
// happening, so nothing to protect.
const OVERSTAY_GRACE_MINUTES = 75

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const overstayCutoff = new Date(Date.now() - OVERSTAY_GRACE_MINUTES * 60 * 1000).toISOString()

  const { data: candidates, error } = await serviceClient
    .from("bookings")
    .select("id, status, ends_at, unifi_visitor_id, unifi_access_policy_id, unifi_schedule_id")
    .not("unifi_visitor_id", "is", null)
    .is("access_revoked_at", null)
    .or(`status.eq.cancelled,and(status.eq.confirmed,ends_at.lte.${overstayCutoff})`)

  if (error) {
    await logFailure(serviceClient, "revoke-access-CRON-query-FAILED", `err=${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!candidates?.length) return NextResponse.json({ revoked: 0 })

  type Candidate = {
    id: string
    status: string
    ends_at: string
    unifi_visitor_id: string
    unifi_access_policy_id: string | null
    unifi_schedule_id: string | null
  }

  let revoked = 0
  let failed = 0

  for (const b of candidates as Candidate[]) {
    try {
      await revokeBayAccess(b.unifi_visitor_id, b.unifi_access_policy_id, b.unifi_schedule_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (serviceClient as any)
        .from("bookings")
        .update({ access_revoked_at: new Date().toISOString() })
        .eq("id", b.id)
      revoked++
    } catch (err) {
      failed++
      await logFailure(serviceClient, "revoke-access-CRON-FAILED",
        `booking=${b.id} status=${b.status} ends_at=${b.ends_at} err=${String(err).slice(0, 200)}`)
    }
  }

  await logEvent(serviceClient, failed > 0 ? "revoke-access-cron-PARTIAL" : "revoke-access-cron-ok",
    `candidates=${candidates.length} revoked=${revoked} failed=${failed}`)

  return NextResponse.json({ candidates: candidates.length, revoked, failed })
}
