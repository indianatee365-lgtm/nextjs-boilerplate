import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendFoundersDayPersonalNotice } from "@/lib/telnyx/sms"
import { sendFounderMessage } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"

// Founder's Club closes 2026-08-18; this fires the next morning at 8am ET,
// once sales have settled, with a personalized note from jerrod (email +
// text, sent together per founder so nobody gets one without the other)
// telling founders their Friends & Founders Day (8/29) booking window is
// open. Safe to run daily forever - date-gated below and idempotent per
// user via admin_logs, so it's a no-op before the date and after everyone's
// already been notified.
const NOTICE_OPENS_AT = new Date("2026-08-19T04:00:00Z") // midnight America/Indiana/Indianapolis
// Scheduled 12:00 UTC (8am ET) in vercel.json - see that file, not here.

function emailParagraphs(): string[] {
  return [
    "Thank you for investing in Tee365. As a founding member, you're the reason this place exists before anyone else even knows about it.",
    "Founders &amp; Friends Day is Saturday, August 29th, and it's yours. Your booking window is open now, so grab at least your 2 free hours if you can make it.",
    "I'll be onsite most of the day, so stop by and say hello. I'd love to meet you in person.",
    "If the 29th doesn't work for you, no pressure. Those hours don't expire, so use them whenever fits.",
    "One more thing: we want you to be our most vocal partners. Before we open to the public, if anything needs fixing, tell us. That's exactly what this day is for.",
  ]
}

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
    .eq("event", "founders-day-personal-notice-sent")

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
    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(f.user_id)
    const email = authUser?.email ?? null

    if (!profile?.first_name || (!email && !(profile?.phone && profile.sms_consent))) { skipped++; continue }

    try {
      await Promise.all([
        email
          ? sendFounderMessage({
              to: email,
              firstName: profile.first_name,
              subject: "Your 2 free hours for Founders & Friends Day (Aug 29)",
              heading: "Founders &amp; Friends Day is August 29",
              paragraphs: emailParagraphs(),
              ctaText: "Book your free hours",
              ctaUrl: "https://tee365.org/book",
            })
          : Promise.resolve(),
        profile.phone && profile.sms_consent
          ? sendFoundersDayPersonalNotice({ to: profile.phone, firstName: profile.first_name })
          : Promise.resolve(),
      ])
      await logEvent(serviceClient, "founders-day-personal-notice-sent", `user=${f.user_id}`)
      sent++
    } catch (e) {
      await logFailure(serviceClient, "founders-day-personal-notice-FAILED", `user=${f.user_id} err=${String(e).slice(0, 200)}`)
      failed++
    }
  }

  await logEvent(serviceClient, "founders-day-notice-cron-ok", `sent=${sent} skipped=${skipped} failed=${failed}`)
  return NextResponse.json({ sent, skipped, failed })
}
