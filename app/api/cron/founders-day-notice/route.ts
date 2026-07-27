import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendFoundersDayBookingOpenSms } from "@/lib/telnyx/sms"
import { logEvent, logFailure } from "@/lib/observability/notify"

// Founder's Club closes 2026-08-18; this fires the day after, once sales
// have settled, telling founders their Friends & Founders Day (8/29)
// booking window is open. Safe to run daily forever - date-gated below and
// idempotent per user via admin_logs, so it's a no-op before the date and
// after everyone's already been notified.
const NOTICE_OPENS_AT = new Date("2026-08-19T04:00:00Z") // midnight America/Indiana/Indianapolis

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (Date.now() < NOTICE_OPENS_AT.getTime()) {
    return NextResponse.json({ sent: 0, note: "not open yet" })
  }

  const serviceClient = await createServiceClient()

  const { data: founders } = await serviceClient
    .from("memberships")
    .select("user_id, profiles(first_name, phone, sms_consent)")
    .eq("plan_type", "founder")
    .eq("status", "active")

  if (!founders?.length) {
    return NextResponse.json({ sent: 0 })
  }

  const { data: alreadySent } = await serviceClient
    .from("admin_logs")
    .select("detail")
    .eq("event", "founders-day-notice-sent")

  const sentUserIds = new Set(
    (alreadySent ?? [])
      .map((r) => /user=([a-f0-9-]+)/.exec(r.detail ?? "")?.[1])
      .filter(Boolean)
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const f of founders) {
    if (!f.user_id || sentUserIds.has(f.user_id)) { skipped++; continue }

    const profile = f.profiles as unknown as { first_name: string; phone: string | null; sms_consent: boolean } | null
    if (!profile?.phone || !profile.sms_consent) { skipped++; continue }

    try {
      await sendFoundersDayBookingOpenSms({ to: profile.phone, firstName: profile.first_name })
      await logEvent(serviceClient, "founders-day-notice-sent", `user=${f.user_id}`)
      sent++
    } catch (e) {
      await logFailure(serviceClient, "founders-day-notice-FAILED", `user=${f.user_id} err=${String(e).slice(0, 200)}`)
      failed++
    }
  }

  await logEvent(serviceClient, "founders-day-notice-cron-ok", `sent=${sent} skipped=${skipped} failed=${failed}`)
  return NextResponse.json({ sent, skipped, failed })
}
