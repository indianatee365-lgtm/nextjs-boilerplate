import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyOwner, logEvent } from "@/lib/observability/notify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// One-time guest checkout check-in (set up 2026-11-15). On 2026-11-13 Jerrod
// parked guest checkout until about two weeks of /admin/funnel data existed
// after the sign-in round-trip fix (vault projects/tee365/guest-checkout-next-
// 2026-11-13.md). vercel.json runs this at 13:00 UTC (8 AM Eastern) on Nov 27;
// it texts the guest vs signed-in numbers since the fix, once, in 2026 only.
const SINCE = "2026-11-13T05:00:00Z" // Nov 13, midnight Eastern: the fix's first full day
const ONLY_ON = "2026-11-27"

type FunnelRow = { session_id: string; step: string; booking_id: string | null; user_id: string | null }

export async function GET(request: NextRequest) {
  const secret = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (new Date().toISOString().slice(0, 10) !== ONLY_ON) {
    return NextResponse.json({ skipped: "not the check-in day" })
  }

  const serviceClient = await createServiceClient()
  const { data: already } = await serviceClient
    .from("admin_logs").select("id").eq("event", "funnel-checkin-sent").limit(1)
  if (already?.length) return NextResponse.json({ skipped: "already sent" })

  const [{ data: rows }, { data: admins }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("booking_funnel_events")
      .select("session_id, step, booking_id, user_id").gte("created_at", SINCE).limit(50000),
    serviceClient.from("profiles").select("id").eq("role", "admin"),
  ])
  const adminIds = new Set((admins ?? []).map((a) => a.id as string))
  const events = (rows ?? []) as FunnelRow[]
  // Same rules as /admin/funnel: sessions with an admin signed in are tests.
  const adminSessions = new Set(events.filter((e) => e.user_id && adminIds.has(e.user_id)).map((e) => e.session_id))
  const customer = events.filter((e) => !adminSessions.has(e.session_id))

  const reservedIds = [...new Set(customer.filter((e) => e.step === "reserved" && e.booking_id).map((e) => e.booking_id as string))]
  const { data: paidRows } = reservedIds.length
    ? await serviceClient.from("bookings").select("id").in("id", reservedIds).eq("status", "confirmed")
    : { data: [] }
  const paidIds = new Set((paidRows ?? []).map((b) => b.id as string))

  type Tally = { visits: number; review: number; signIn: number; back: number; paid: number }
  const blank = (): Tally => ({ visits: 0, review: 0, signIn: 0, back: 0, paid: 0 })
  const tally = { guest: blank(), signedIn: blank() }
  const bySession = new Map<string, FunnelRow[]>()
  for (const e of customer) bySession.set(e.session_id, [...(bySession.get(e.session_id) ?? []), e])
  for (const evs of bySession.values()) {
    const t = evs.some((e) => e.step === "view" && e.user_id) ? tally.signedIn : tally.guest
    const paid = evs.some((e) => e.step === "reserved" && e.booking_id && paidIds.has(e.booking_id))
    t.visits++
    if (paid || evs.some((e) => e.step === "time" || e.step === "reserved")) t.review++
    if (evs.some((e) => e.step === "login")) t.signIn++
    if (evs.some((e) => e.step === "returned")) t.back++
    if (paid) t.paid++
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "n/a")
  const g = tally.guest
  const s = tally.signedIn
  const msg =
    "Tee365 guest checkout check-in (Nov 13-26):\n" +
    `Guests: ${g.visits} visits, ${g.review} reached review, ${g.paid} paid (${pct(g.paid, g.review)} of review). ` +
    `${g.signIn} tapped sign-in, ${g.back} came back.\n` +
    `Signed in: ${s.visits} visits, ${s.review} reached review, ${s.paid} paid (${pct(s.paid, s.review)} of review).\n` +
    "Build guest checkout if guests trail signed-in by 10+ points, or many who tap sign-in never come back. " +
    "Details: tee365.org/admin/funnel"

  await notifyOwner(msg)
  await logEvent(serviceClient, "funnel-checkin-sent", msg.slice(0, 500))
  return NextResponse.json({ sent: true, tally })
}
