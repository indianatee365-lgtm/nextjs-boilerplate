import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendFounderMonthlyHoursNotice } from "@/lib/telnyx/sms"
import { sendFounderMessage } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"

// One-time announcement of founders' monthly free hours (2026-10-07), from
// jerrod, by text and email together. NOT scheduled: triggered by hand.
//
// Follows the campaign send protocol learned from the 2026-06-06 double send:
//   * dry run unless ?send=1, listing who would get it and how
//   * at most ?limit= (default and max 10) founders per call
//   * each founder is marked in admin_logs BEFORE sending; a failed send
//     removes the mark so a later call retries that founder only
//   * ?only=<user id> sends to exactly one founder, for the first live test
const EVENT = "founder-monthly-hours-announcement-sent"

function emailParagraphs(): string[] {
  return [
    "You backed Tee365 before almost anyone knew it existed, and I haven't forgotten it.",
    "Starting this month, every founding member gets 2 free hours of bay time every month, on top of your founder discount. October's 2 hours are already in your account.",
    "Book any open bay at tee365.org/book and they come off your total automatically. Morning, night or weekend, it's your call.",
    "They reset on the 1st of each month and don't carry over, so use October's by the 31st. November's show up on November 1st.",
    "See you at the bay.",
  ]
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const send = request.nextUrl.searchParams.get("send") === "1"
  const only = request.nextUrl.searchParams.get("only")
  const limit = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 10) || 10))

  const serviceClient = await createServiceClient()

  const { data: founders } = await serviceClient
    .from("memberships")
    .select("user_id, profiles(first_name, phone, sms_consent)")
    .eq("plan_type", "founder")
    .eq("status", "active")

  const { data: alreadySent } = await serviceClient.from("admin_logs").select("detail").eq("event", EVENT)
  const sentUserIds = new Set(
    (alreadySent ?? []).map((r) => /user=([a-f0-9-]+)/.exec(r.detail ?? "")?.[1]).filter(Boolean),
  )

  const pending = (founders ?? [])
    .filter((f) => f.user_id && !sentUserIds.has(f.user_id))
    .filter((f) => !only || f.user_id === only)
    .slice(0, limit)

  const plan: { user: string; name: string; email: boolean; sms: boolean }[] = []
  let sent = 0
  let failed = 0

  for (const f of pending) {
    const profile = f.profiles as unknown as { first_name: string; phone: string | null; sms_consent: boolean } | null
    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(f.user_id!)
    const email = authUser?.email ?? null
    const sms = Boolean(profile?.phone && profile.sms_consent)
    plan.push({ user: f.user_id!, name: profile?.first_name ?? "?", email: Boolean(email), sms })
    if (!send || !profile?.first_name || (!email && !sms)) continue

    await logEvent(serviceClient, EVENT, `user=${f.user_id}`)
    try {
      await Promise.all([
        email
          ? sendFounderMessage({
              to: email,
              firstName: profile.first_name,
              subject: "A thank-you for our founders: 2 free hours every month",
              heading: "2 free hours, every month",
              paragraphs: emailParagraphs(),
              ctaText: "Book your free hours",
              ctaUrl: "https://tee365.org/book",
            })
          : Promise.resolve(),
        sms ? sendFounderMonthlyHoursNotice({ to: profile.phone!, firstName: profile.first_name }) : Promise.resolve(),
      ])
      sent++
    } catch (e) {
      failed++
      await serviceClient.from("admin_logs").delete().eq("event", EVENT).eq("detail", `user=${f.user_id}`)
      await logFailure(serviceClient, "founder-monthly-hours-announcement-FAILED",
        `user=${f.user_id} err=${String(e).slice(0, 200)}`)
    }
  }

  const remaining = (founders ?? []).filter((f) => f.user_id && !sentUserIds.has(f.user_id)).length - sent
  if (send) await logEvent(serviceClient, "founder-monthly-hours-announcement-run", `sent=${sent} failed=${failed} remaining=${remaining}`)
  return NextResponse.json({ dryRun: !send, sent, failed, remaining, batch: plan })
}
