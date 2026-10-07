import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { grantFounderMonthlyHours } from "@/lib/membership/founder-monthly"

// Daily, 09:00 UTC (5am Eastern), from vercel.json. Idempotent: see
// lib/membership/founder-monthly.ts.
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const result = await grantFounderMonthlyHours(serviceClient)
  return NextResponse.json(result)
}
