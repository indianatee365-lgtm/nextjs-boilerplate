import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { funnelRatelimit } from "@/lib/ratelimit"

const STEPS = new Set(["view", "date", "time", "login", "reserved"])
const UUID = /^[0-9a-f-]{36}$/i

// Records one booking-funnel step (see lib/funnel.ts). Always answers 204 so a
// bad or repeated event is silently dropped rather than surfacing anywhere.
export async function POST(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await funnelRatelimit.limit(ip)
  if (!success) return new NextResponse(null, { status: 204 })

  const body = await request.json().catch(() => null) as { sessionId?: unknown; step?: unknown; bookingId?: unknown } | null
  const sessionId = typeof body?.sessionId === "string" && UUID.test(body.sessionId) ? body.sessionId : null
  const step = typeof body?.step === "string" && STEPS.has(body.step) ? body.step : null
  if (!sessionId || !step) return new NextResponse(null, { status: 204 })
  const bookingId = step === "reserved" && typeof body?.bookingId === "string" && UUID.test(body.bookingId) ? body.bookingId : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const serviceClient = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("booking_funnel_events").upsert(
    { session_id: sessionId, step, booking_id: bookingId, user_id: user?.id ?? null },
    { onConflict: "session_id,step", ignoreDuplicates: true },
  )
  return new NextResponse(null, { status: 204 })
}
