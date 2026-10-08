import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { confirmMatch } from "@/lib/league/matches"
import { logEvent, logFailure } from "@/lib/observability/notify"

// Hourly (vercel.json). Scores entered more than 12 hours ago that nobody
// confirmed or disputed confirm themselves (rules: "Scores").
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const cutoff = new Date(Date.now() - 12 * 3600 * 1000).toISOString()
  const { data } = await db.from("league_results").select("match_id").eq("status", "entered").lt("entered_at", cutoff)
  let confirmed = 0
  for (const r of (data ?? []) as { match_id: string }[]) {
    try {
      await confirmMatch(db, r.match_id, null)
      confirmed++
    } catch (e) {
      await logFailure(db, "league-autoconfirm-FAILED", `match=${r.match_id} err=${String(e).slice(0, 200)}`)
    }
  }
  if (confirmed) await logEvent(db, "league-autoconfirm-run", `confirmed=${confirmed}`)
  return NextResponse.json({ confirmed })
}
