import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { planLeagueTexts, runLeagueTexts } from "@/lib/league/texts"

export const maxDuration = 300

// Every 15 minutes Wed to Fri UTC (vercel.json). Sends whatever league player
// texts are due on the Eastern clock; see lib/league/texts.ts.
//   ?dry=1           plan only, nothing sent or marked
//   ?dry=1&at=<ISO>  plan as if it were that moment (testing)
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const q = request.nextUrl.searchParams
  if (q.get("dry") === "1") {
    const at = q.get("at") ? new Date(q.get("at")!) : new Date()
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "bad at" }, { status: 400 })
    const plan = await planLeagueTexts(db, at)
    return NextResponse.json({ dryRun: true, at: at.toISOString(), count: plan.length, plan })
  }
  return NextResponse.json(await runLeagueTexts(db, new Date()))
}
