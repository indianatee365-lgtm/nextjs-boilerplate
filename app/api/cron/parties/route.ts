import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runParties } from "@/lib/tickets"
import { runEventDoors } from "@/lib/events"

export const maxDuration = 300

// Every 15 minutes (vercel.json): party door codes, sending codes to buyers,
// bays on/off (lib/tickets runParties). Cheap when no party is near.
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const now = new Date()
  return NextResponse.json({ done: [...(await runParties(db, now)), ...(await runEventDoors(db, now))] })
}
