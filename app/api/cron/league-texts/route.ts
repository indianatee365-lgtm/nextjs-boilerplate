import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { planLeagueTexts, runLeagueTexts } from "@/lib/league/texts"
import { runLeagueNight } from "@/lib/league/night"

export const maxDuration = 300

// Every 15 minutes Wed to Fri UTC (vercel.json). First the league night
// operations (door code, bays on/off; lib/league/night.ts), then whatever
// player texts are due (lib/league/texts.ts), so a door code created this
// run is in this run's texts. Both read the Eastern clock.
//   ?dry=1           plan only, nothing sent, created or switched
//   ?dry=1&at=<ISO>  plan as if it were that moment (testing)
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const q = request.nextUrl.searchParams
  // ?doorTest=1: create a real door code for a harmless window (3:00 to
  // 3:05am two days out) and delete it straight away. Proves the UniFi path
  // end to end without ever returning the code.
  if (q.get("doorTest") === "1") {
    const { grantBayAccess, revokeBayAccess } = await import("@/lib/access-control")
    const start = new Date(Date.now() + 2 * 86400000)
    start.setUTCHours(7, 15, 0, 0)
    try {
      const g = await grantBayAccess({ bookingId: "league-door-test", firstName: "League", lastName: "Door Test", phone: "", bayName: "Test", startsAt: start, endsAt: new Date(start.getTime() + 5 * 60000) })
      if (!g.userId) return NextResponse.json({ granted: false, reason: "UniFi not configured" })
      await revokeBayAccess(g.userId, g.accessPolicyId, g.scheduleId)
      return NextResponse.json({ granted: true, pinLength: g.pinCode.length, revoked: true })
    } catch (e) {
      return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 })
    }
  }
  if (q.get("dry") === "1") {
    const at = q.get("at") ? new Date(q.get("at")!) : new Date()
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "bad at" }, { status: 400 })
    const night = await runLeagueNight(db, at, { dry: true })
    const plan = await planLeagueTexts(db, at)
    return NextResponse.json({ dryRun: true, at: at.toISOString(), night: night.steps, count: plan.length, plan })
  }
  const now = new Date()
  const night = await runLeagueNight(db, now)
  const texts = await runLeagueTexts(db, now)
  return NextResponse.json({ night: night.steps, ...texts })
}
