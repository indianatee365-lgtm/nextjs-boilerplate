import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendLeagueFoundersNotice } from "@/lib/telnyx/sms"
import { sendFounderMessage } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"

// Founders' guaranteed league spot (2026-10-08), from jerrod, text + email.
// Same campaign protocol as the founder-hours announcement:
//   * dry run unless ?send=1; ?preview=<admin id> sends to that admin only
//   * at most 10 founders per call, each marked in admin_logs BEFORE sending,
//     the mark removed if the send fails so only that founder is retried
//   * ?requireLive=1 refuses to send unless the league is published, which is
//     how the Friday 9:00am pg_cron job calls it
const EVENT = "league-founders-announcement-sent"
const SUBJECT = "Your guaranteed spot in the Thursday Night League"
const HEADING = "Founders sign up first"

function paragraphs(): string[] {
  return [
    "Tee365's first league starts Thursday, October 22, and as a founder your spot is guaranteed. Signup is open to founders only until Monday morning, before anyone else can get in.",
    "It's two-person teams, everyone plays their own ball, 9 holes a night on a different course each week. A/B match play with handicaps, so every skill level has a shot.",
    "$30 a week per player, charged each league night, and 100% of the pot is paid out in cash.",
    "I'm running it personally. Every rule is written down on the league page before anyone tees off.",
  ]
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const q = request.nextUrl.searchParams

  const previewTo = q.get("preview")
  if (previewTo) {
    const { data: admin } = await db.from("profiles").select("first_name, phone, sms_consent, role").eq("id", previewTo).maybeSingle()
    const a = admin as { first_name: string; phone: string | null; sms_consent: boolean; role: string } | null
    if (!a || a.role !== "admin") return NextResponse.json({ error: "Preview goes to admin accounts only" }, { status: 400 })
    const { data: { user } } = await db.auth.admin.getUserById(previewTo)
    await Promise.all([
      user?.email ? sendFounderMessage({
        to: user.email, firstName: a.first_name, subject: `[Preview] ${SUBJECT}`, heading: HEADING,
        paragraphs: paragraphs(), ctaText: "See the league and sign up", ctaUrl: "https://tee365.org/league",
        kind: "founder-message-preview",
      }) : Promise.resolve(),
      a.phone && a.sms_consent ? sendLeagueFoundersNotice({ to: a.phone, firstName: a.first_name }) : Promise.resolve(),
    ])
    await logEvent(db, "league-founders-announcement-preview", `to=${previewTo}`)
    return NextResponse.json({ preview: true })
  }

  const send = q.get("send") === "1"
  if (send && q.get("requireLive") === "1") {
    const { data: league } = await db.from("leagues").select("active").eq("slug", "thursday-night").maybeSingle()
    if (!(league as { active: boolean } | null)?.active) {
      await logEvent(db, "league-founders-announcement-SKIPPED", "league not published")
      return NextResponse.json({ skipped: "league not published" })
    }
  }
  const limit = Math.min(10, Math.max(1, Number(q.get("limit") ?? 10) || 10))

  const { data: founders } = await db
    .from("memberships").select("user_id, profiles(first_name, phone, sms_consent)")
    .eq("plan_type", "founder").eq("status", "active")
  const { data: alreadySent } = await db.from("admin_logs").select("detail").eq("event", EVENT)
  const sentIds = new Set(((alreadySent ?? []) as { detail: string | null }[])
    .map((r) => /user=([a-f0-9-]+)/.exec(r.detail ?? "")?.[1]).filter(Boolean))
  const all = ((founders ?? []) as { user_id: string; profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null }[])
    .filter((f) => f.user_id && !sentIds.has(f.user_id))
  const batch = all.slice(0, limit)

  const plan: { user: string; name: string; email: boolean; sms: boolean }[] = []
  let sent = 0
  let failed = 0
  for (const f of batch) {
    const p = f.profiles
    const { data: { user } } = await db.auth.admin.getUserById(f.user_id)
    const email = user?.email ?? null
    const sms = Boolean(p?.phone && p.sms_consent)
    plan.push({ user: f.user_id, name: p?.first_name ?? "?", email: Boolean(email), sms })
    if (!send || !p?.first_name || (!email && !sms)) continue
    await logEvent(db, EVENT, `user=${f.user_id}`)
    try {
      await Promise.all([
        email ? sendFounderMessage({
          to: email, firstName: p.first_name, subject: SUBJECT, heading: HEADING, paragraphs: paragraphs(),
          ctaText: "See the league and sign up", ctaUrl: "https://tee365.org/league",
        }) : Promise.resolve(),
        sms ? sendLeagueFoundersNotice({ to: p.phone!, firstName: p.first_name }) : Promise.resolve(),
      ])
      sent++
    } catch (e) {
      failed++
      await db.from("admin_logs").delete().eq("event", EVENT).eq("detail", `user=${f.user_id}`)
      await logFailure(db, "league-founders-announcement-FAILED", `user=${f.user_id} err=${String(e).slice(0, 200)}`)
    }
  }
  const remaining = all.length - sent
  if (send) await logEvent(db, "league-founders-announcement-run", `sent=${sent} failed=${failed} remaining=${remaining}`)
  return NextResponse.json({ dryRun: !send, sent, failed, remaining, batch: plan })
}
