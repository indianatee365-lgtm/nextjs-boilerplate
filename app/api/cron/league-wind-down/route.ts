import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { runLeagueWindDown } from "@/lib/league/wind-down"

// One-time fall 2026 league go/no-go, from vercel.json on Wed 10/28 8:07am
// Eastern. ?dry=1 shows exactly what it would do, and is also open to a
// signed-in admin so jerrod can check it from the browser. Remove the cron
// entry after it has run.
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const dry = q.get("dry") === "1"
  const secret = request.headers.get("x-cron-secret")
    ?? q.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  let authorized = secret === process.env.CRON_SECRET
  if (!authorized && dry) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      authorized = (profile as { role: string } | null)?.role === "admin"
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const at = dry && q.get("at") ? new Date(q.get("at")!) : undefined
  if (at && Number.isNaN(at.getTime())) return NextResponse.json({ error: "bad at" }, { status: 400 })
  return NextResponse.json({ dryRun: dry, ...(await runLeagueWindDown(db, { dry, now: at })) })
}
