import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { planLeagueCharges, runLeagueCharges } from "@/lib/league/charges"

// Daily from vercel.json; only does anything on a league night. ?dry=1 shows
// the plan for today, or for ?date=YYYY-MM-DD, without charging anyone.
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const q = request.nextUrl.searchParams
  if (q.get("dry") === "1") {
    const date = q.get("date") ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Indiana/Indianapolis" })
    return NextResponse.json({ dryRun: true, date, ...(await planLeagueCharges(db, date)) })
  }
  return NextResponse.json(await runLeagueCharges(db))
}
