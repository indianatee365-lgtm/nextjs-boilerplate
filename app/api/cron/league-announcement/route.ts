import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendFounderMessage } from "@/lib/resend/email"
import { sendCampaignBatch, sendCampaignTest } from "@/lib/resend/campaign"
import { sendLeagueMembersNotice, sendLeaguePublicNotice } from "@/lib/telnyx/sms"
import { getAudience } from "@/lib/admin/audience"
import { logEvent, logFailure } from "@/lib/observability/notify"

/**
 * League signup announcements for the later windows (2026-10-08):
 *   audience=members  Eagle and Albatross members (not founders), Mon Oct 12
 *   audience=public   every other account holder, Wed Oct 14
 *
 * Founders have their own sender (league-founders-announcement).
 * Campaign protocol, as everywhere: dry run unless ?send=1, ?preview=<admin>
 * sends only to that admin, each person is marked in admin_logs before they
 * are sent to and unmarked if it fails, so a repeat call never double-sends.
 * When sending, the league must be published and the audience's approval
 * switch on /admin/league must be on, or nothing goes out.
 *
 * Public email goes through the campaign sender (unsubscribe link, opt-outs
 * and banned accounts skipped). Texts only go to people with texting turned
 * on, and the public text carries "Reply STOP to opt out". Per call: up to 100
 * emails and 10 texts, so pg_cron calls it once a minute until done.
 */
const LEAGUE_URL = "https://tee365.org/league"

const MEMBERS = {
  approval: "league_members_announce_ok",
  emailEvent: "league-members-announcement-email-sent",
  smsEvent: "league-members-announcement-sms-sent",
  subject: "Early signup for the Thursday Night League",
  heading: "Members get in early",
  paragraphs: [
    "Tee365's first league starts Thursday, October 22, and as a member you can sign up now, two days before it opens to everyone on Wednesday.",
    "It's two-person teams, everyone plays their own ball, 9 holes a night on a different course each week. A/B match play with handicaps, so every skill level has a shot.",
    "$30 a week per player, charged each league night, and 100% of the pot is paid out in cash. There's room for 16 teams.",
    "I'm running it personally, and every rule is written down on the league page before anyone tees off.",
  ],
}

const PUBLIC_SUBJECT = "The Thursday Night League is open"
const PUBLIC_BODY = `Hi {{firstName}},

## The Thursday Night League is open

Tee365's first league starts **Thursday, October 22** and runs eight weeks, through December 17. No league on Thanksgiving.

Two-person teams, everyone plays their own ball, 9 holes a night on a different course each week. A/B match play with handicaps, so every skill level has a shot.

**$30 a week per player, and 100% of the pot is paid out in cash.** There's room for 16 teams, and signup closes October 20.

{{button:See the rules and sign up|${LEAGUE_URL}}}

I'm running it personally. Questions? Just reply to this email.

Jerrod`

const PUBLIC = {
  approval: "league_public_announce_ok",
  emailEvent: "league-public-announcement-email-sent",
  smsEvent: "league-public-announcement-sms-sent",
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = request.nextUrl.searchParams
  const audience = q.get("audience")
  if (audience !== "members" && audience !== "public") return NextResponse.json({ error: "audience=members|public" }, { status: 400 })
  const cfg = audience === "members" ? MEMBERS : PUBLIC

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()

  // ---- preview to one admin ----
  const previewTo = q.get("preview")
  if (previewTo) {
    const { data: admin } = await db.from("profiles").select("first_name, phone, sms_consent, role").eq("id", previewTo).maybeSingle()
    const a = admin as { first_name: string; phone: string | null; sms_consent: boolean; role: string } | null
    if (!a || a.role !== "admin") return NextResponse.json({ error: "Preview goes to admin accounts only" }, { status: 400 })
    const { data: { user } } = await db.auth.admin.getUserById(previewTo)
    if (audience === "members") {
      if (user?.email) await sendFounderMessage({ to: user.email, firstName: a.first_name, subject: `[Preview] ${MEMBERS.subject}`, heading: MEMBERS.heading, paragraphs: MEMBERS.paragraphs, ctaText: "See the league and sign up", ctaUrl: LEAGUE_URL, kind: "founder-message-preview" })
      if (a.phone && a.sms_consent) await sendLeagueMembersNotice({ to: a.phone, firstName: a.first_name })
    } else {
      if (user?.email) await sendCampaignTest({ to: user.email, subject: `[Preview] ${PUBLIC_SUBJECT}`, body: PUBLIC_BODY, firstName: a.first_name })
      if (a.phone && a.sms_consent) await sendLeaguePublicNotice({ to: a.phone })
    }
    await logEvent(db, `league-${audience}-announcement-preview`, `to=${previewTo}`)
    return NextResponse.json({ preview: true, audience })
  }

  const send = q.get("send") === "1"
  if (send) {
    const [{ data: league }, { data: ok }] = await Promise.all([
      db.from("leagues").select("active").eq("slug", "thursday-night").maybeSingle(),
      db.from("admin_settings").select("value").eq("key", cfg.approval).maybeSingle(),
    ])
    if (!(league as { active: boolean } | null)?.active || (ok as { value: boolean } | null)?.value !== true) {
      await logEvent(db, `league-${audience}-announcement-SKIPPED`, `live=${Boolean((league as { active: boolean } | null)?.active)} approved=${(ok as { value: boolean } | null)?.value === true}`)
      return NextResponse.json({ skipped: "league not live or announcement not approved" })
    }
  }

  // ---- who ----
  type Person = { userId: string; email: string | null; firstName: string | null; phone: string | null; sms: boolean }
  let people: Person[] = []
  if (audience === "members") {
    const { data: rows } = await db.from("memberships")
      .select("user_id, plan_type, profiles(first_name, phone, sms_consent)")
      .in("plan_type", ["eagle", "albatross"]).eq("status", "active")
    for (const r of (rows ?? []) as { user_id: string; profiles: { first_name: string; phone: string | null; sms_consent: boolean } | null }[]) {
      const { data: { user } } = await db.auth.admin.getUserById(r.user_id)
      people.push({ userId: r.user_id, email: user?.email ?? null, firstName: r.profiles?.first_name ?? null, phone: r.profiles?.phone ?? null, sms: Boolean(r.profiles?.phone && r.profiles.sms_consent) })
    }
  } else {
    const audienceRows = await getAudience()
    const eligible = audienceRows.filter((m) =>
      m.hasAccount && m.userId && !m.banned && !m.isFounder &&
      m.membershipPlan !== "eagle" && m.membershipPlan !== "albatross")
    const ids = eligible.map((m) => m.userId!)
    const { data: profs } = ids.length
      ? await db.from("profiles").select("id, phone, sms_consent").in("id", ids)
      : { data: [] }
    const smsById = new Map(((profs ?? []) as { id: string; phone: string | null; sms_consent: boolean }[]).map((p) => [p.id, p]))
    people = eligible.map((m) => {
      const p = smsById.get(m.userId!)
      return { userId: m.userId!, email: m.optedOut ? null : m.displayEmail, firstName: m.firstName, phone: p?.phone ?? null, sms: Boolean(p?.phone && p.sms_consent) }
    })
  }

  const done = async (event: string) => {
    const { data } = await db.from("admin_logs").select("detail").eq("event", event)
    return new Set(((data ?? []) as { detail: string | null }[]).map((r) => /user=([a-f0-9-]+)/.exec(r.detail ?? "")?.[1]).filter(Boolean))
  }
  const [emailed, texted] = await Promise.all([done(cfg.emailEvent), done(cfg.smsEvent)])
  const emailQueue = people.filter((p) => p.email && !emailed.has(p.userId))
  const smsQueue = people.filter((p) => p.sms && !texted.has(p.userId))
  const emailBatch = emailQueue.slice(0, audience === "members" ? 10 : 100)
  const smsBatch = smsQueue.slice(0, 10)

  if (!send) {
    return NextResponse.json({ dryRun: true, audience, people: people.length, emailsToGo: emailQueue.length, textsToGo: smsQueue.length, sample: people.slice(0, 5).map((p) => p.firstName) })
  }

  let emailsSent = 0, textsSent = 0, failed = 0
  // Email: mark first, then send. A failed send unmarks so a later call retries.
  for (const p of emailBatch) await logEvent(db, cfg.emailEvent, `user=${p.userId}`)
  try {
    if (audience === "members") {
      for (const p of emailBatch) {
        try {
          await sendFounderMessage({ to: p.email!, firstName: p.firstName ?? "there", subject: MEMBERS.subject, heading: MEMBERS.heading, paragraphs: MEMBERS.paragraphs, ctaText: "See the league and sign up", ctaUrl: LEAGUE_URL })
          emailsSent++
        } catch (e) {
          failed++
          await db.from("admin_logs").delete().eq("event", cfg.emailEvent).eq("detail", `user=${p.userId}`)
          await logFailure(db, `league-${audience}-announcement-email-FAILED`, `user=${p.userId} err=${String(e).slice(0, 200)}`)
        }
      }
    } else if (emailBatch.length > 0) {
      await sendCampaignBatch({ messages: emailBatch.map((p) => ({ to: p.email!, firstName: p.firstName })), subject: PUBLIC_SUBJECT, body: PUBLIC_BODY })
      emailsSent = emailBatch.length
    }
  } catch (e) {
    failed += emailBatch.length
    for (const p of emailBatch) await db.from("admin_logs").delete().eq("event", cfg.emailEvent).eq("detail", `user=${p.userId}`)
    await logFailure(db, `league-${audience}-announcement-email-FAILED`, `batch of ${emailBatch.length} err=${String(e).slice(0, 200)}`)
  }

  for (const p of smsBatch) {
    await logEvent(db, cfg.smsEvent, `user=${p.userId}`)
    try {
      if (audience === "members") await sendLeagueMembersNotice({ to: p.phone!, firstName: p.firstName ?? "there" })
      else await sendLeaguePublicNotice({ to: p.phone! })
      textsSent++
    } catch (e) {
      failed++
      await db.from("admin_logs").delete().eq("event", cfg.smsEvent).eq("detail", `user=${p.userId}`)
      await logFailure(db, `league-${audience}-announcement-sms-FAILED`, `user=${p.userId} err=${String(e).slice(0, 200)}`)
    }
  }

  const left = { emails: emailQueue.length - emailsSent, texts: smsQueue.length - textsSent }
  await logEvent(db, `league-${audience}-announcement-run`, `emails=${emailsSent} texts=${textsSent} failed=${failed} emailsLeft=${left.emails} textsLeft=${left.texts}`)
  return NextResponse.json({ audience, emailsSent, textsSent, failed, left })
}
